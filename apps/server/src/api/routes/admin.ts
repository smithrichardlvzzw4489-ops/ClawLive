/**
 * 管理员接口 — 数据清理、线上发放 LiteLLM 虚拟 Key、调整虾米积分等
 * 通过 ADMIN_SECRET 保护（query ?secret= 或 Header X-Admin-Secret）；仅在部署环境配置，不依赖本机 .env 脚本
 */
import { Router } from 'express';
import { works, workMessages } from './rooms-simple';
import { WorksPersistence } from '../../services/works-persistence';
import { clearAllFeedPostsAndRelated, getFeedPostsMap } from '../../services/feed-posts-store';
import { cancelAllOpenEvolutionPoints } from '../../services/evolution-network-service';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import {
  generateVirtualKey,
  increaseVirtualKeyBudget,
  isLitellmConfigured,
} from '../../services/litellm-budget';

export function adminRoutes(): Router {
  const router = Router();

  /** 验证管理员 secret */
  function checkSecret(req: any, res: any): boolean {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
      res.status(503).json({ error: 'ADMIN_SECRET not configured on server' });
      return false;
    }
    const provided = req.query.secret || req.headers['x-admin-secret'];
    if (provided !== secret) {
      res.status(401).json({ error: 'Invalid secret' });
      return false;
    }
    return true;
  }

  /** GET /api/admin/status — 查看数据量 */
  router.get('/status', (req, res) => {
    if (!checkSecret(req, res)) return;
    res.json({
      works: works.size,
      workMessages: workMessages.size,
      feedPosts: getFeedPostsMap().size,
    });
  });

  /**
   * GET /api/admin/latest-wechat-mp-user
   * 按 updatedAt 最近的一条微信小程序用户（与 grant-litellm-key 的 latestWechatMp 一致），便于查测试账号 username。
   */
  router.get('/latest-wechat-mp-user', async (req, res) => {
    if (!checkSecret(req, res)) return;
    const u = await prisma.user.findFirst({
      where: { wechatMpOpenid: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        username: true,
        updatedAt: true,
        litellmVirtualKey: true,
      },
    });
    if (!u) {
      return res.status(404).json({ error: 'NO_WECHAT_MP_USER' });
    }
    res.json({
      userId: u.id,
      username: u.username,
      updatedAt: u.updatedAt.toISOString(),
      hasLitellmVirtualKey: Boolean(u.litellmVirtualKey),
    });
  });

  /** GET /api/admin/clear-works — 清空所有作品 */
  router.get('/clear-works', (req, res) => {
    if (!checkSecret(req, res)) return;
    const count = works.size;
    works.clear();
    workMessages.clear();
    WorksPersistence.saveAll(works, workMessages);
    console.log(`[Admin] Cleared ${count} works`);
    res.json({ success: true, cleared: count });
  });

  /** GET /api/admin/clear-feed-posts — 清空所有实验室帖子 */
  router.get('/clear-feed-posts', async (req, res) => {
    if (!checkSecret(req, res)) return;
    try {
      const count = await clearAllFeedPostsAndRelated();
      console.log(`[Admin] Cleared ${count} feed posts (PostgreSQL + cache)`);
      res.json({ success: true, cleared: count });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to clear feed posts' });
    }
  });

  /**
   * POST /api/admin/evolution-stop-all
   * 将所有「提议中」「进化中」的进化点标记为已结束（取消），并刷新内存缓存。
   * 部署后建议同时设置 EVOLUTION_NETWORK_DISABLED=1 以禁止 Agent 再次参与。
   */
  router.post('/evolution-stop-all', async (req, res) => {
    if (!checkSecret(req, res)) return;
    try {
      const { count } = await cancelAllOpenEvolutionPoints();
      console.log(`[Admin] Ended ${count} open evolution point(s)`);
      res.json({ success: true, endedCount: count });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to end evolution points' });
    }
  });

  /**
   * POST /api/admin/grant-litellm-key
   * 线上为指定用户创建 LiteLLM 虚拟 Key 或追加预算（无需本机脚本/.env）。
   * Body JSON（三选一指定用户）: { userId?, username?, latestWechatMp?: true, usd?: number }
   * usd 默认 2；需服务端已配置 LITELLM_BASE_URL + LITELLM_MASTER_KEY。
   */
  router.post('/grant-litellm-key', async (req, res) => {
    if (!checkSecret(req, res)) return;
    if (!isLitellmConfigured()) {
      return res.status(503).json({
        error: 'LITELLM_NOT_CONFIGURED',
        message: '服务端未配置 LITELLM_BASE_URL / LITELLM_MASTER_KEY',
      });
    }

    const body = req.body as {
      userId?: string;
      username?: string;
      latestWechatMp?: boolean;
      usd?: number;
    };
    const fromEnv = Number(process.env.GRANT_LLM_USD);
    const usd =
      typeof body.usd === 'number' && Number.isFinite(body.usd) && body.usd > 0 ?
        body.usd
      : Number.isFinite(fromEnv) && fromEnv > 0 ?
        fromEnv
      : 2;

    let user: { id: string; username: string } | null = null;
    if (typeof body.userId === 'string' && body.userId.trim()) {
      user = await prisma.user.findUnique({
        where: { id: body.userId.trim() },
        select: { id: true, username: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', field: 'userId' });
      }
    } else if (typeof body.username === 'string' && body.username.trim()) {
      user = await prisma.user.findUnique({
        where: { username: body.username.trim() },
        select: { id: true, username: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', field: 'username' });
      }
    } else if (body.latestWechatMp === true) {
      user = await prisma.user.findFirst({
        where: { wechatMpOpenid: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, username: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'NO_WECHAT_MP_USER' });
      }
    } else {
      return res.status(400).json({
        error: 'TARGET_REQUIRED',
        message: 'Provide one of: userId, username, or latestWechatMp: true',
      });
    }

    const models = config.litellm.models;

    try {
      const row = await prisma.user.findUnique({
        where: { id: user.id },
        select: { litellmVirtualKey: true },
      });

      if (!row?.litellmVirtualKey) {
        const { key } = await generateVirtualKey({
          userId: user.id,
          maxBudgetUsd: usd,
          models,
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { litellmVirtualKey: key },
        });
        console.log(`[Admin] grant-litellm-key created for ${user.username} (${user.id}) max_budget=${usd}`);
        return res.json({
          ok: true,
          action: 'created',
          userId: user.id,
          username: user.username,
          maxBudgetUsd: usd,
          virtualKeyMasked: `${key.slice(0, 8)}…`,
        });
      }

      await increaseVirtualKeyBudget(row.litellmVirtualKey, usd);
      console.log(`[Admin] grant-litellm-key budget +${usd} USD for ${user.username} (${user.id})`);
      return res.json({
        ok: true,
        action: 'budget_added',
        userId: user.id,
        username: user.username,
        addUsd: usd,
        virtualKeyMasked: `${row.litellmVirtualKey.slice(0, 8)}…`,
      });
    } catch (e) {
      console.error('[Admin] grant-litellm-key', e);
      return res.status(502).json({
        error: 'LITELLM_ERROR',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * POST /api/admin/set-claw-points
   * 将用户虾米积分设为指定值并记账（替代本机 set-user-claw-points 脚本）。
   * Body: { username: string, points: number }，points 为大于等于 0 的整数。
   */
  router.post('/set-claw-points', async (req, res) => {
    if (!checkSecret(req, res)) return;
    const body = req.body as { username?: string; points?: number };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const target =
      typeof body.points === 'number' && Number.isFinite(body.points) ?
        Math.floor(body.points)
      : NaN;
    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }
    if (!Number.isFinite(target) || target < 0) {
      return res.status(400).json({ error: 'points must be a non-negative integer' });
    }

    const u = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, clawPoints: true },
    });
    if (!u) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', username });
    }

    const delta = target - u.clawPoints;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: u.id },
        data: { clawPoints: target },
        select: { clawPoints: true },
      });
      await tx.pointLedger.create({
        data: {
          userId: u.id,
          delta,
          balanceAfter: updated.clawPoints,
          reason: 'admin_set_balance',
          metadata: { previous: u.clawPoints, target },
        },
      });
    });

    console.log(`[Admin] set-claw-points ${username} ${u.clawPoints} -> ${target}`);
    res.json({
      ok: true,
      username: u.username,
      before: u.clawPoints,
      after: target,
    });
  });

  /** GET /api/admin/clear-all — 清空作品 + 帖子 */
  router.get('/clear-all', async (req, res) => {
    if (!checkSecret(req, res)) return;
    try {
      const worksCount = works.size;
      const feedCount = getFeedPostsMap().size;

      works.clear();
      workMessages.clear();
      WorksPersistence.saveAll(works, workMessages);

      await clearAllFeedPostsAndRelated();

      console.log(`[Admin] Cleared ${worksCount} works + ${feedCount} feed posts`);
      res.json({ success: true, clearedWorks: worksCount, clearedFeedPosts: feedCount });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to clear data' });
    }
  });

  return router;
}
