/**
 * LLM 服务：默认若已配置 LiteLLM（LITELLM_BASE_URL + LITELLM_MASTER_KEY）则走代理；
 * 否则走 OpenRouter（OPENROUTER_API_KEY）。
 *
 * 若同时配置了 LiteLLM 与 OpenRouter，默认仍优先 LiteLLM；需让进化器/摘要走 OpenRouter 时请设
 * SERVER_LLM_USE_OPENROUTER=1，并设置 OPENROUTER_API_KEY 与 OPENROUTER_MODEL。
 *
 * 「发布/摘要」类服务端调用（作品一句话摘要、帖子 excerpt、Darwin 进化器评估等）共用
 * {@link getPublishingLlmClient}。
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

/** 为 true 时：在已配置 LiteLLM 的情况下仍用 OpenRouter 作为发布/摘要/进化器客户端（需 OPENROUTER_API_KEY） */
function publishingLlmForceOpenRouter(): boolean {
  const v = process.env.SERVER_LLM_USE_OPENROUTER?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'openrouter';
}

function openRouterPublishingClient(): LlmClient {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      '已设置 SERVER_LLM_USE_OPENROUTER，但未设置 OPENROUTER_API_KEY',
    );
  }
  const base = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  return {
    client: new OpenAI({ apiKey: key, baseURL: base }),
    model: modelForOpenRouter(),
  };
}

/**
 * 与作品结果摘要、社区帖子摘要、Darwin 进化器评估共用：同一客户端与模型选择。
 */
export function getPublishingLlmClient(): LlmClient {
  if (publishingLlmForceOpenRouter()) {
    return openRouterPublishingClient();
  }
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
      baseURL: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
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

function stripMarkdownJsonFence(text: string): string {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(s);
  if (fence) s = fence[1].trim();
  return s;
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
    const prompt = `你是 Darwin Agent 的「进化顾问」。根据以下信息，输出**仅一段 JSON 对象**（不要其它说明文字），格式如下（键名必须一致）：
{"summary":"本轮能力评估一句话","selfAssessment":"自我能力简述（2-3句）","improvements":["改进项1（具体可执行）","改进项2","改进项3"]}
改进项最多 3 条，与技能、工具、与主人协作相关；若信息不足可写通用能力提升方向。

用户名：${context.username}
Darwin 问卷/背景（节选）：${context.onboardingSnippet || '（无）'}
最近对话节选：${context.recentMessages || '（无）'}
待学习技能提示：${context.pendingSkill || '（无）'}`;

    const baseParams = {
      model,
      messages: [{ role: 'user' as const, content: prompt }],
      max_tokens: 800,
      temperature: 0.35,
    };

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        ...baseParams,
        response_format: { type: 'json_object' },
      });
    } catch (err) {
      console.warn(
        '[EvolverAssessment] response_format json_object not accepted, retrying without:',
        err instanceof Error ? err.message : err,
      );
      response = await client.chat.completions.create(baseParams);
    }

    const raw = response.choices[0]?.message?.content?.trim() || '';
    if (!raw) {
      console.error('[EvolverAssessment] empty model content (model=%s)', model);
      return null;
    }

    const cleaned = stripMarkdownJsonFence(raw);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[EvolverAssessment] no JSON object in response (model=%s): %s', model, raw.slice(0, 400));
      return null;
    }
    let parsed: { summary?: string; selfAssessment?: string; improvements?: unknown };
    try {
      parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
    } catch (parseErr) {
      console.error(
        '[EvolverAssessment] JSON.parse failed (model=%s): %s | snippet=%s',
        model,
        parseErr instanceof Error ? parseErr.message : parseErr,
        jsonMatch[0].slice(0, 300),
      );
      return null;
    }
    const improvements = Array.isArray(parsed.improvements)
      ? parsed.improvements.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [];
    return {
      summary: String(parsed.summary || '本轮评估完成').slice(0, 500),
      selfAssessment: String(parsed.selfAssessment || '').slice(0, 800),
      improvements: improvements.length ? improvements.slice(0, 3) : ['提升工具调用稳定性', '加强与主人目标对齐', '补充领域知识'],
    };
  } catch (err) {
    console.error(
      '[EvolverAssessment] call failed:',
      err instanceof Error ? err.message : err,
    );
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
