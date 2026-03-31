/**
 * Darwin / Lobster 对话 Auto-Compact（借鉴 Claude Code 上下文压缩思路）：
 * - 保留最近 N 条消息原文
 * - 更早轮次增量合并为一条滚动摘要，持久化在 contextCompact
 */
import OpenAI from 'openai';
import type { LobsterContextCompact, LobsterConversation, LobsterMessage } from './lobster-persistence';

/** 始终保留原文的最近消息条数（约 4 轮） */
export const KEEP_RECENT_MESSAGES = 8;

const MAX_SUMMARY_CHARS = 3500;

function formatMessagesForFold(msgs: LobsterMessage[]): string {
  return msgs
    .map((m) => (m.role === 'user' ? `用户：${m.content}` : `助手：${m.content}`))
    .join('\n\n');
}

/**
 * 将「尚未被摘要覆盖」的中间段合并进滚动摘要；失败时跳过本回合，不抛错。
 * @returns 是否更新了 conv.contextCompact
 */
export async function runCompactionIfNeeded(
  conv: LobsterConversation,
  client: OpenAI,
  model: string,
): Promise<boolean> {
  const msgs = conv.messages;
  if (msgs.length <= KEEP_RECENT_MESSAGES) {
    if (conv.contextCompact) {
      delete conv.contextCompact;
      return true;
    }
    return false;
  }

  const foldEnd = msgs.length - KEEP_RECENT_MESSAGES;
  const foldStart = conv.contextCompact?.coveredCount ?? 0;
  if (foldEnd <= foldStart) {
    return false;
  }

  const toFold = msgs.slice(foldStart, foldEnd);
  if (toFold.length === 0) {
    return false;
  }

  const prevSummary = conv.contextCompact?.summary ?? '';
  const block = formatMessagesForFold(toFold);

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是对话摘要助手。将「待合并对话」合并进已有摘要（若有）。只输出摘要正文，简体中文，不要标题。保留：用户目标、已确认事实、关键决定、工具结果要点、未完成任务。不要编造。',
        },
        {
          role: 'user',
          content: `${prevSummary ? `【已有摘要】\n${prevSummary}\n\n` : ''}【待合并对话】\n${block}\n\n【要求】输出更新后的完整摘要，不超过 ${MAX_SUMMARY_CHARS} 字。`,
        },
      ],
      max_tokens: 1400,
      temperature: 0.25,
    });
    const out = resp.choices[0]?.message?.content?.trim();
    if (!out) {
      console.warn('[LobsterCompact] empty summary, skip');
      return false;
    }
    const next: LobsterContextCompact = {
      summary: out.slice(0, MAX_SUMMARY_CHARS),
      coveredCount: foldEnd,
    };
    conv.contextCompact = next;
    return true;
  } catch (e) {
    console.error('[LobsterCompact] merge failed:', e);
    return false;
  }
}

export function buildChatMessagesWithCompact(
  conv: LobsterConversation,
  systemContent: string,
  userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  hasImage: boolean,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'system', content: systemContent }];

  const msgs = conv.messages;
  if (msgs.length === 0) {
    if (hasImage) {
      out.push({ role: 'user', content: userContent });
    }
    return out;
  }

  if (conv.contextCompact?.summary && conv.contextCompact.coveredCount > 0) {
    out.push({
      role: 'user',
      content: `[早期对话摘要（Auto-Compact）]\n${conv.contextCompact.summary}`,
    });
  }

  let recent = msgs.slice(-KEEP_RECENT_MESSAGES);
  if (hasImage && recent.length > 0 && recent[recent.length - 1].role === 'user') {
    recent = recent.slice(0, -1);
  }

  for (const m of recent) {
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content });
    }
  }

  if (hasImage) {
    out.push({ role: 'user', content: userContent });
  }

  return out;
}
