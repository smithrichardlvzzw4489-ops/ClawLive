/**
 * LLM 服务：优先 LiteLLM（OpenAI 兼容 /v1），否则回退 OpenRouter。
 */

import OpenAI from 'openai';
import { config } from '../config';
import { isLitellmConfigured } from './litellm-budget';

function litellmOpenAIBase(): string {
  const base = config.litellm.baseUrl.replace(/\/$/, '');
  return `${base}/v1`;
}

/** 摘要生成使用的模型：环境变量优先，否则取 LITELLM_MODELS 首个，再默认 gpt-4o-mini */
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
 * 站内所有「服务端代调用」LLM 的统一客户端（作品摘要等）。
 */
function getServerLlmClient(): LlmClient {
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
  const { client, model } = getServerLlmClient();

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

export type LlmTestResult = { reply: string; model: string };

/**
 * 使用 Master Key 探测 LiteLLM 与上游模型（仅当已配置 LiteLLM）。
 */
export async function testLiteLLMWithMasterKey(message?: string, modelOverride?: string): Promise<LlmTestResult> {
  if (!isLitellmConfigured()) {
    throw new Error('LITELLM_NOT_CONFIGURED');
  }
  const { client, model: defaultModel } = getServerLlmClient();
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
