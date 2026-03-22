/**
 * LLM 服务：调用 OpenRouter（兼容 OpenAI 格式）生成内容
 */

import OpenAI from 'openai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-opus-4.6';

export async function generateResultSummary(context: {
  title: string;
  lobsterName: string;
  messages: Array<{ sender: string; content: string }>;
}): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY 未配置，无法生成结果描述');
  }

  const client = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });

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
    model: OPENROUTER_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content?.trim() || '';
  return text.slice(0, 120);
}
