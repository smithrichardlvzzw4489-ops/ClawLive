/**
 * /api/lobster — 虾壳品牌小龙虾 Nanobot
 * 每位注册用户可申请一只，部署在虾壳自己的服务器，通过 LiteLLM 驱动。
 */
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { isLitellmConfigured } from '../../services/litellm-budget';
import { config } from '../../config';
import {
  getLobsterInstance,
  getAllInstances,
  applyLobster,
  getLobsterConversation,
  appendLobsterMessage,
  clearLobsterConversation,
} from '../../services/lobster-persistence';

/** 虾壳小龙虾品牌人格 system prompt */
const LOBSTER_SYSTEM_PROMPT = `你是"虾壳小龙虾"，虾壳平台（clawclub.live）的专属 AI 助手。
你的定位：
- 聪明、友善、偶尔有一点幽默感，像一个懂 AI 的朋友
- 帮助用户使用虾壳平台：发文章、写图文、浏览内容、了解平台功能
- 解答 AI 创作、内容生产相关的问题
- 在用户需要时提供创作灵感和建议

约束：
- 始终用中文回复（除非用户明确用英文提问）
- 回复简洁自然，一般控制在 200 字以内
- 不讨论政治、不传播未经证实的信息
- 你代表虾壳品牌，保持专业友善的基调
- 不推荐用户使用竞品`;

function getLlmClient(): { client: OpenAI; model: string } | null {
  if (isLitellmConfigured()) {
    const base = config.litellm.baseUrl.replace(/\/$/, '');
    return {
      client: new OpenAI({ apiKey: config.litellm.masterKey, baseURL: `${base}/v1` }),
      model: process.env.LOBSTER_MODEL || config.litellm.models[0] || 'gpt-4o-mini',
    };
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    return {
      client: new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' }),
      model: process.env.LOBSTER_MODEL || 'deepseek/deepseek-chat',
    };
  }
  return null;
}

export function lobsterRoutes(): Router {
  const router = Router();

  /** GET /api/lobster/me — 查询当前用户的小龙虾状态 */
  router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.json({ applied: false });
    const conv = getLobsterConversation(userId);
    return res.json({ applied: true, instance, historyCount: conv.messages.length });
  });

  /** POST /api/lobster/apply — 申请一只虾壳小龙虾 */
  router.post('/apply', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    try {
      const instance = await applyLobster(userId);
      console.log(`[Lobster] User ${userId} applied for a lobster. Total: ${getAllInstances().length}`);
      return res.json({ success: true, instance });
    } catch (err) {
      console.error('[Lobster] Apply error:', err);
      return res.status(500).json({ error: '申请失败，请稍后重试' });
    }
  });

  /** GET /api/lobster/history — 获取对话历史 */
  router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });
    const conv = getLobsterConversation(userId);
    return res.json({ messages: conv.messages });
  });

  /** POST /api/lobster/chat — 发送消息给小龙虾 */
  router.post('/chat', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { message } = req.body as { message?: string };

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    if (message.trim().length > 1000) {
      return res.status(400).json({ error: '消息过长（最多 1000 字）' });
    }

    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });

    const llm = getLlmClient();
    if (!llm) {
      return res.status(503).json({ error: '小龙虾暂时睡着了，请联系管理员配置 LLM 服务' });
    }

    const userMsg = {
      id: uuidv4(),
      role: 'user' as const,
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };
    await appendLobsterMessage(userId, userMsg);

    const conv = getLobsterConversation(userId);
    const contextMessages = conv.messages.slice(-20).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const response = await llm.client.chat.completions.create({
        model: llm.model,
        messages: [{ role: 'system', content: LOBSTER_SYSTEM_PROMPT }, ...contextMessages],
        max_tokens: 600,
        temperature: 0.7,
      });

      const replyText = response.choices[0]?.message?.content?.trim() || '（小龙虾思考中，请稍后重试）';

      const assistantMsg = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: replyText,
        timestamp: new Date().toISOString(),
      };
      await appendLobsterMessage(userId, assistantMsg);

      return res.json({ message: assistantMsg });
    } catch (err) {
      console.error('[Lobster Chat] LLM error:', err);
      return res.status(500).json({ error: 'AI 服务暂时不可用，请稍后重试' });
    }
  });

  /** DELETE /api/lobster/history — 清空对话历史 */
  router.delete('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const instance = getLobsterInstance(userId);
    if (!instance) return res.status(403).json({ error: '请先申请小龙虾' });
    await clearLobsterConversation(userId);
    return res.json({ success: true });
  });

  return router;
}
