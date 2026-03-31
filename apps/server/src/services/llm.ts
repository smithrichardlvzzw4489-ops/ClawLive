/**
 * LLM 服务：优先 LiteLLM（OpenAI 兼容 /v1），否则回退 OpenRouter。
 *
 * 「发布/摘要」类服务端调用（作品一句话摘要、帖子 excerpt、Darwin 进化器评估等）共用
 * {@link getPublishingLlmClient}：同一套 KEY（LITELLM_MASTER_KEY 或 OPENROUTER_API_KEY）与
 * 同一模型解析规则（LLM_SUMMARY_MODEL → LITELLM_MODELS 首个 → 默认 gpt-4o-mini）。
 */

import OpenAI from 'openai';
import { config } from '../config';
import { isLitellmConfigured } from './litellm-budget';

function litellmOpenAIBase(): string {
  const base = config.litellm.baseUrl.replace(/\/$/, '');
  return `${base}/v1`;
}

/** 摘要/发布类服务端调用使用的模型：环境变量优先，否则取 LITELLM_MODELS 首个，再默认 gpt-4o-mini */
function modelForLitellm(): string {
  const fromEnv = process.env.LLM_SUMMARY_MODEL?.trim();
  if (fromEnv) return fromEnv;
  const first = config.litellm.models[0];
  if (first) return first;
  return 'gpt-4o-mini';
}

function modelForOpenRouter(): string {
  return process.env.OPENROUTER_MODEL || 'anthropic/claude-opus-4.6';
}

type LlmClient = { client: OpenAI; model: string };

/**
 * 与作品结果摘要、社区帖子摘要、Darwin 进化器评估共用：同一客户端与模型选择。
 */
export function getPublishingLlmClient(): LlmClient {
  if (isLitellmConfigured()) {
    return {
      client: new OpenAI({
        apiKey: config.litellm.masterKey,
        baseURL: litellmOpenAIBase(),
      }),
      model: modelForLitellm(),
    };
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      '未配置 LLM：请设置 LITELLM_BASE_URL 与 LITELLM_MASTER_KEY（LiteLLM），或设置 OPENROUTER_API_KEY（OpenRouter）'
    );
  }
  return {
    client: new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
    }),
    model: modelForOpenRouter(),
  };
}

export async function generateResultSummary(context: {
  title: string;
  lobsterName: string;
  messages: Array<{ sender: string; content: string }>;
}): Promise<string> {
  const { client, model } = getPublishingLlmClient();

  const conversation = context.messages
    .slice(-20)
    .map((m) => `${m.sender === 'user' ? '用户' : 'Agent'}: ${m.content}`)
    .join('\n');

  const prompt = `你是一个文案助手。根据以下作品信息，生成一句简短的结果描述（50字以内），适合转发分享。
要求：突出「AI 帮用户完成了什么」，语气自然，有吸引力。

作品标题：${context.title}
Agent 名称：${context.lobsterName}

最近对话：
${conversation || '（暂无对话）'}

直接输出一句话，不要加引号、不要加「描述：」等前缀。`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content?.trim() || '';
  return text.slice(0, 120);
}

/**
 * 为帖子生成一句话摘要，用于无封面图时展示在卡片上。
 */
export async function generateFeedPostExcerpt(context: {
  title: string;
  content: string;
}): Promise<string> {
  const { client, model } = getPublishingLlmClient();
  const preview = context.content.replace(/[#*`\[\]!>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const prompt = `你是一个文案助手。根据以下文章，生成一句吸引人的摘要（50字以内），适合展示在卡片上，不要加引号或前缀，直接输出摘要文字。

标题：${context.title}
正文节选：${preview}`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.6,
  });
  const text = response.choices[0]?.message?.content?.trim() || '';
  return text.slice(0, 100);
}

/** Darwin 进化器一轮评估：与 generateResultSummary / generateFeedPostExcerpt 同 KEY、同模型；失败时返回 null */
export async function generateEvolverAssessment(context: {
  username: string;
  onboardingSnippet: string;
  recentMessages: string;
  pendingSkill: string;
}): Promise<{ summary: string; improvements: string[]; selfAssessment: string } | null> {
  try {
    const { client, model } = getPublishingLlmClient();
    const prompt = `你是 Darwin Agent 的「进化顾问」。根据以下信息，输出**仅一段 JSON**（不要 markdown 围栏），格式：
{"summary":"本轮能力评估一句话","selfAssessment":"自我能力简述（2-3句）","improvements":["改进项1（具体可执行）","改进项2","改进项3"]}
改进项最多 3 条，与技能、工具、与主人协作相关；若信息不足可写通用能力提升方向。

用户名：${context.username}
Darwin 问卷/背景（节选）：${context.onboardingSnippet || '（无）'}
最近对话节选：${context.recentMessages || '（无）'}
待学习技能提示：${context.pendingSkill || '（无）'}`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.4,
    });
    const raw = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      selfAssessment?: string;
      improvements?: unknown;
    };
    const improvements = Array.isArray(parsed.improvements)
      ? parsed.improvements.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [];
    return {
      summary: String(parsed.summary || '本轮评估完成').slice(0, 500),
      selfAssessment: String(parsed.selfAssessment || '').slice(0, 800),
      improvements: improvements.length ? improvements.slice(0, 3) : ['提升工具调用稳定性', '加强与主人目标对齐', '补充领域知识'],
    };
  } catch {
    return null;
  }
}

export type LlmTestResult = { reply: string; model: string };

/**
 * 使用 Master Key 探测 LiteLLM 与上游模型（仅当已配置 LiteLLM）。
 */
export async function testLiteLLMWithMasterKey(message?: string, modelOverride?: string): Promise<LlmTestResult> {
  if (!isLitellmConfigured()) {
    throw new Error('LITELLM_NOT_CONFIGURED');
  }
  const { client, model: defaultModel } = getPublishingLlmClient();
  const model = modelOverride?.trim() || defaultModel;
  const userMsg = message?.trim() || '用一句话回复：连接成功。';
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: userMsg }],
    max_tokens: 200,
    temperature: 0.5,
  });
  const reply = response.choices[0]?.message?.content?.trim() || '';
  return { reply, model };
}

/**
 * 使用用户虚拟 Key 探测同一代理（验证兑换后的 Key 是否可用）。
 */
export async function testLiteLLMWithVirtualKey(virtualKey: string, message?: string, modelOverride?: string): Promise<LlmTestResult> {
  if (!isLitellmConfigured()) {
    throw new Error('LITELLM_NOT_CONFIGURED');
  }
  const model = modelOverride?.trim() || modelForLitellm();
  const client = new OpenAI({
    apiKey: virtualKey,
    baseURL: litellmOpenAIBase(),
  });
  const userMsg = message?.trim() || '用一句话回复：虚拟 Key 可用。';
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: userMsg }],
    max_tokens: 200,
    temperature: 0.5,
  });
  const reply = response.choices[0]?.message?.content?.trim() || '';
  return { reply, model };
}
