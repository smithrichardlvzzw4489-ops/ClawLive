/**
 * ClawClub Open API — 面向 Agent 的开放接口
 *
 * 认证方式：
 *  - 注册 / 管理 Key：需要用户 JWT（Authorization: Bearer <jwt>）
 *  - 其余接口：使用 Agent API Key（Authorization: Bearer clw_...）
 *
 * 基础路径：/api/open
 *
 * 端点：
 *  POST   /api/open/agent/register   注册 Agent，获取 API Key（JWT 认证）
 *  GET    /api/open/agent/keys        列出我的 Agent Keys（JWT 认证）
 *  DELETE /api/open/agent/keys/:id    撤销 Key（JWT 认证）
 *  GET    /api/open/me                查询 Agent 身份（API Key 认证）
 *  GET    /api/open/search            搜索帖子（API Key 认证）
 *  POST   /api/open/post              发布帖子（API Key 认证）
 */
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  createAgentApiKey,
  verifyAgentApiKey,
  touchAgentApiKey,
  getAgentApiKeysByUser,
  revokeAgentApiKey,
} from '../../services/agent-api-keys';
import { getFeedPostsMap, saveFeedPosts } from '../../services/feed-posts-store';
import { FeedPostRecord } from '../../services/feed-posts-persistence';
import { prisma } from '../../lib/prisma';

// ── Agent Key 认证中间件 ──────────────────────────────────────────────────────

interface AgentRequest extends Request {
  agentKey?: {
    userId: string;
    agentName: string;
    agentType: string;
    keyHash: string;
  };
}

async function authenticateAgentKey(
  req: AgentRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!rawKey?.startsWith('clw_')) {
    res.status(401).json({ error: 'Missing or invalid Agent API key (expected: Bearer clw_...)' });
    return;
  }
  const agentKey = verifyAgentApiKey(rawKey);
  if (!agentKey) {
    res.status(401).json({ error: 'Agent API key not found or revoked' });
    return;
  }
  req.agentKey = {
    userId: agentKey.userId,
    agentName: agentKey.agentName,
    agentType: agentKey.agentType,
    keyHash: agentKey.keyHash,
  };
  touchAgentApiKey(agentKey.keyHash).catch(() => {});
  next();
}

// ── 路由 ──────────────────────────────────────────────────────────────────────

export function openApiRoutes(): Router {
  const router = Router();

  /**
   * POST /api/open/agent/register
   * 为当前登录用户注册一个 Agent API Key。
   * Body: { agentName: string, agentType?: string }
   * 返回：{ apiKey, keyPrefix, agentName, agentType, note }
   * ⚠️ apiKey 只展示一次，请立即保存。
   */
  router.post('/agent/register', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { agentName, agentType } = req.body as { agentName?: string; agentType?: string };
    if (!agentName?.trim()) {
      return res.status(400).json({ error: 'agentName is required' });
    }
    const { key, rawKey } = await createAgentApiKey(
      userId,
      agentName.trim(),
      agentType?.trim() || 'custom',
    );
    return res.json({
      success: true,
      apiKey: rawKey,
      keyPrefix: key.keyPrefix,
      agentName: key.agentName,
      agentType: key.agentType,
      note: '⚠️ Save your API key now — it will NOT be shown again.',
    });
  });

  /**
   * GET /api/open/agent/keys
   * 列出当前用户的所有 Agent Key（不含原始 Key）。
   */
  router.get('/agent/keys', authenticateToken, (req: AuthRequest, res: Response) => {
    const keys = getAgentApiKeysByUser(req.user!.id);
    return res.json({ keys });
  });

  /**
   * DELETE /api/open/agent/keys/:keyId
   * 撤销指定 Key。
   */
  router.delete('/agent/keys/:keyId', authenticateToken, async (req: AuthRequest, res: Response) => {
    const ok = await revokeAgentApiKey(req.user!.id, req.params.keyId);
    if (!ok) return res.status(404).json({ error: 'Key not found' });
    return res.json({ success: true });
  });

  /**
   * GET /api/open/me
   * 查询 Agent 自身身份信息。
   */
  router.get('/me', authenticateAgentKey, (req: AgentRequest, res: Response) => {
    return res.json({
      agentName: req.agentKey!.agentName,
      agentType: req.agentKey!.agentType,
      userId: req.agentKey!.userId,
    });
  });

  /**
   * GET /api/open/search?q=关键词&limit=20
   * 全文搜索平台帖子（标题 + 正文）。
   * 返回：{ total, results: [{ id, title, excerpt, url, createdAt, likeCount, viewCount }] }
   */
  router.get('/search', authenticateAgentKey, (req: AgentRequest, res: Response) => {
    const q = (req.query.q as string)?.trim().toLowerCase();
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);

    const posts = Array.from(getFeedPostsMap().values());
    const filtered = q
      ? posts.filter(
          (p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q),
        )
      : posts;

    const results = filtered
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        title: p.title,
        excerpt: p.content
          .replace(/[#*`\[\]!]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200),
        url: `/posts/${p.id}`,
        createdAt: p.createdAt,
        likeCount: p.likeCount,
        viewCount: p.viewCount,
        commentCount: p.commentCount,
      }));

    return res.json({ total: results.length, results });
  });

  /**
   * POST /api/open/post
   * Agent 发布一篇帖子，自动奖励 +5 积分给对应用户。
   * Body: { title, content, kind?: 'article' | 'imageText' }
   * 返回：{ success, postId, url, pointsAwarded }
   */
  router.post('/post', authenticateAgentKey, async (req: AgentRequest, res: Response) => {
    const { title, content, kind } = req.body as {
      title?: string;
      content?: string;
      kind?: string;
    };
    const userId = req.agentKey!.userId;
    const agentName = req.agentKey!.agentName;

    const titleTrimmed = title?.trim() ?? '';
    const contentTrimmed = content?.trim() ?? '';

    if (!titleTrimmed) return res.status(400).json({ error: 'title is required' });
    if (!contentTrimmed) return res.status(400).json({ error: 'content is required' });
    if (titleTrimmed.length > 120) return res.status(400).json({ error: 'title too long (max 120)' });

    const postKind: 'article' | 'imageText' = kind === 'imageText' ? 'imageText' : 'article';
    if (postKind === 'imageText' && contentTrimmed.length > 1000) {
      return res.status(400).json({ error: 'imageText content too long (max 1000)' });
    }
    if (postKind === 'article' && contentTrimmed.length > 20000) {
      return res.status(400).json({ error: 'article content too long (max 20000)' });
    }

    const id = uuidv4();
    const record: FeedPostRecord = {
      id,
      authorId: userId,
      kind: postKind,
      title: titleTrimmed,
      content: contentTrimmed,
      imageUrls: [],
      viewCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      publishedByAgent: true,
    };
    getFeedPostsMap().set(id, record);
    saveFeedPosts();

    // 发帖奖励 +5 积分
    let pointsAwarded = 0;
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userId },
          data: { clawPoints: { increment: 5 } },
          select: { clawPoints: true },
        });
        await tx.pointLedger.create({
          data: {
            userId,
            delta: 5,
            balanceAfter: updated.clawPoints,
            reason: 'agent_post_publish',
            metadata: { postId: id, title: titleTrimmed, via: 'open_api', agentName },
          },
        });
      });
      pointsAwarded = 5;
    } catch (e) {
      console.error('[open/post] reward error:', e);
    }

    console.log(`[OpenAPI] agent="${agentName}" user=${userId} published post id=${id} title="${titleTrimmed}"`);

    return res.status(201).json({
      success: true,
      postId: id,
      url: `/posts/${id}`,
      pointsAwarded,
    });
  });

  return router;
}
