/**
 * 管理员接口 — 数据清理
 * 通过 ADMIN_SECRET 环境变量保护，URL 参数传入 secret 验证
 */
import { Router } from 'express';
import { works, workMessages } from './rooms-simple';
import { WorksPersistence } from '../../services/works-persistence';
import { clearAllFeedPostsAndRelated, getFeedPostsMap } from '../../services/feed-posts-store';
import { cancelAllOpenEvolutionPoints } from '../../services/evolution-network-service';

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
