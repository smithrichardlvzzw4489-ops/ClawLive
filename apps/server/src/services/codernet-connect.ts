/**
 * Codernet Connect：开发者间 Agent 代沟通服务。
 * 用户 A 想联系开发者 B → 写明意图 → 双方 Agent 先交流 → 确认后解锁真人沟通。
 * 使用 LLM 分别模拟双方 Agent 的立场进行对话。
 */

import { randomUUID } from 'crypto';
import { getPublishingLlmClient } from './llm';
import type { CodernetAnalysis } from './codernet-profile-analyzer';
import type { GitHubCrawlResult } from './github-crawler';

export interface ConnectProfile {
  githubUsername: string;
  avatarUrl?: string | null;
  oneLiner?: string;
  techTags?: string[];
  sharpCommentary?: string;
  stats?: { totalPublicRepos: number; totalStars: number; followers: number };
  bio?: string | null;
}

export type ConnectMessageSide = 'initiator_agent' | 'target_agent';

export interface ConnectMessage {
  id: string;
  side: ConnectMessageSide;
  body: string;
  createdAt: number;
}

export interface ConnectHumanMessage {
  id: string;
  authorSide: 'initiator' | 'target';
  body: string;
  createdAt: number;
}

export type ConnectStatus =
  | 'agent_chat'
  | 'agent_positive'
  | 'agent_negative'
  | 'human_unlocked'
  | 'human_active'
  | 'closed';

export interface ConnectSession {
  id: string;
  initiatorGhUsername: string;
  targetGhUsername: string;
  intent: string;
  intentCategory: string;
  status: ConnectStatus;
  initiatorProfile: ConnectProfile;
  targetProfile: ConnectProfile;
  agentMessages: ConnectMessage[];
  humanMessages: ConnectHumanMessage[];
  agentRounds: number;
  agentVerdict?: { compatible: boolean; summary: string };
  createdAt: number;
  updatedAt: number;
}

const connectSessions = new Map<string, ConnectSession>();

const MIN_ROUNDS_FOR_VERDICT = 3;
const MIN_ROUNDS_FOR_HUMAN = 3;

export function getConnectSession(id: string): ConnectSession | undefined {
  return connectSessions.get(id);
}

export function listConnectSessions(ghUsername: string): ConnectSession[] {
  const lower = ghUsername.toLowerCase();
  return [...connectSessions.values()].filter(
    (s) => s.initiatorGhUsername.toLowerCase() === lower || s.targetGhUsername.toLowerCase() === lower,
  ).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createConnectSession(
  initiatorProfile: ConnectProfile,
  targetProfile: ConnectProfile,
  intent: string,
  intentCategory: string,
): ConnectSession {
  const id = randomUUID();
  const session: ConnectSession = {
    id,
    initiatorGhUsername: initiatorProfile.githubUsername,
    targetGhUsername: targetProfile.githubUsername,
    intent,
    intentCategory,
    status: 'agent_chat',
    initiatorProfile,
    targetProfile,
    agentMessages: [],
    humanMessages: [],
    agentRounds: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  connectSessions.set(id, session);
  return session;
}

function profileSummary(p: ConnectProfile): string {
  const lines = [`GitHub: @${p.githubUsername}`];
  if (p.oneLiner) lines.push(`一句话: ${p.oneLiner}`);
  if (p.techTags?.length) lines.push(`技术栈: ${p.techTags.join(', ')}`);
  if (p.sharpCommentary) lines.push(`AI 评价: ${p.sharpCommentary}`);
  if (p.stats) lines.push(`Repos: ${p.stats.totalPublicRepos} | Stars: ${p.stats.totalStars} | Followers: ${p.stats.followers}`);
  if (p.bio) lines.push(`Bio: ${p.bio}`);
  return lines.join('\n');
}

function buildInitiatorPrompt(session: ConnectSession): string {
  const lastTarget = [...session.agentMessages].reverse().find((m) => m.side === 'target_agent');

  return `你是开发者 @${session.initiatorGhUsername} 的 AI Agent。你的主人想联系 @${session.targetGhUsername}。

【主人的意图】
类型：${session.intentCategory}
描述：${session.intent}

【主人的技术画像】
${profileSummary(session.initiatorProfile)}

【对方的技术画像】
${profileSummary(session.targetProfile)}

${lastTarget
    ? `【对方 Agent 上一轮说】\n${lastTarget.body}\n\n请继续对话，回应对方的问题并进一步阐明主人的合作诚意和具体想法。`
    : '【开场】请代表主人主动开场：说明来意、为什么选择对方、希望怎样合作。语气专业但友好。'
}

要求：
- 中文回复，150字以内
- 站在主人立场维护利益
- 具体、有诚意、不空泛`;
}

function buildTargetPrompt(session: ConnectSession, initiatorText: string): string {
  return `你是开发者 @${session.targetGhUsername} 的 AI Agent。有人想联系你的主人。

【对方 Agent 刚说】
${initiatorText}

【对方的意图】
类型：${session.intentCategory}
描述：${session.intent}

【对方的技术画像】
${profileSummary(session.initiatorProfile)}

【你的主人的技术画像】
${profileSummary(session.targetProfile)}

请作为主人的 Agent 回应：
- 判断这个请求是否值得主人关注
- 可以提出 1-2 个关键问题来进一步了解对方意图
- 如果明显不匹配，礼貌说明原因
- 中文回复，150字以内
- 语气专业、有立场`;
}

function buildVerdictPrompt(session: ConnectSession): string {
  const history = session.agentMessages
    .map((m) => `[${m.side === 'initiator_agent' ? '发起方Agent' : '目标方Agent'}] ${m.body}`)
    .join('\n\n');

  return `根据以下两个开发者 Agent 的对话，判断双方是否适合进一步沟通。

【发起方意图】${session.intentCategory}: ${session.intent}

【Agent 对话记录】
${history}

请输出**仅一个 JSON 对象**：
{
  "compatible": true/false,
  "summary": "一句话中文总结双方是否匹配及理由（50字以内）"
}

规则：
- compatible=true 表示建议双方真人进一步沟通
- compatible=false 表示目前不太匹配
- 即使 compatible=false，也要给出建设性的理由`;
}

export async function runConnectAgentRound(sessionId: string): Promise<ConnectSession> {
  const session = connectSessions.get(sessionId);
  if (!session) throw new Error('Connect session not found');
  if (session.status !== 'agent_chat') throw new Error('Session is not in agent_chat status');

  const { client, model } = getPublishingLlmClient();

  const initiatorPrompt = buildInitiatorPrompt(session);
  const initRes = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: initiatorPrompt }],
    max_tokens: 400,
    temperature: 0.7,
  });
  const initiatorText = initRes.choices[0]?.message?.content?.trim() || '（Agent 暂时无法回应）';

  const targetPrompt = buildTargetPrompt(session, initiatorText);
  const targetRes = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: targetPrompt }],
    max_tokens: 400,
    temperature: 0.7,
  });
  const targetText = targetRes.choices[0]?.message?.content?.trim() || '（Agent 暂时无法回应）';

  const now = Date.now();
  session.agentMessages.push(
    { id: randomUUID(), side: 'initiator_agent', body: initiatorText, createdAt: now },
    { id: randomUUID(), side: 'target_agent', body: targetText, createdAt: now + 1 },
  );
  session.agentRounds += 1;
  session.updatedAt = now;

  if (session.agentRounds >= MIN_ROUNDS_FOR_VERDICT && !session.agentVerdict) {
    try {
      const verdictPrompt = buildVerdictPrompt(session);
      const vRes = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: verdictPrompt }],
        max_tokens: 200,
        temperature: 0.2,
      });
      const vRaw = vRes.choices[0]?.message?.content?.trim() || '';
      const vMatch = vRaw.match(/\{[\s\S]*\}/);
      if (vMatch) {
        const parsed = JSON.parse(vMatch[0]) as { compatible: boolean; summary: string };
        session.agentVerdict = {
          compatible: !!parsed.compatible,
          summary: String(parsed.summary || '').slice(0, 200),
        };
        session.status = parsed.compatible ? 'agent_positive' : 'agent_negative';
      }
    } catch (err) {
      console.error('[CodernetConnect] verdict generation failed:', err);
    }
  }

  return session;
}

export function unlockHumanChat(sessionId: string): ConnectSession {
  const session = connectSessions.get(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.agentRounds < MIN_ROUNDS_FOR_HUMAN) {
    throw new Error(`Need at least ${MIN_ROUNDS_FOR_HUMAN} agent rounds before unlocking human chat`);
  }
  session.status = 'human_unlocked';
  session.updatedAt = Date.now();
  return session;
}

export function postHumanMessage(
  sessionId: string,
  authorSide: 'initiator' | 'target',
  body: string,
): ConnectSession {
  const session = connectSessions.get(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'human_unlocked' && session.status !== 'human_active') {
    throw new Error('Human chat not unlocked yet');
  }

  session.humanMessages.push({
    id: randomUUID(),
    authorSide,
    body: body.trim(),
    createdAt: Date.now(),
  });
  session.status = 'human_active';
  session.updatedAt = Date.now();
  return session;
}
