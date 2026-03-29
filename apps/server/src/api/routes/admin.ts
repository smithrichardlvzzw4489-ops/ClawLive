/**
 * 管理员接口 — 数据清理
 * 通过 ADMIN_SECRET 环境变量保护，URL 参数传入 secret 验证
 */
import { Router } from 'express';
import { works, workMessages } from './rooms-simple';
import { WorksPersistence } from '../../services/works-persistence';
import { getFeedPostsMap, saveFeedPosts } from '../../services/feed-posts-store';
import { FeedPostsPersistence } from '../../services/feed-posts-persistence';

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
  router.get('/clear-feed-posts', (req, res) => {
    if (!checkSecret(req, res)) return;
    const map = getFeedPostsMap();
    const count = map.size;
    map.clear();
    FeedPostsPersistence.save(map);
    console.log(`[Admin] Cleared ${count} feed posts`);
    res.json({ success: true, cleared: count });
  });

  /** GET /api/admin/clear-all — 清空作品 + 帖子 */
  router.get('/clear-all', (req, res) => {
    if (!checkSecret(req, res)) return;
    const worksCount = works.size;
    const feedMap = getFeedPostsMap();
    const feedCount = feedMap.size;

    works.clear();
    workMessages.clear();
    WorksPersistence.saveAll(works, workMessages);

    feedMap.clear();
    FeedPostsPersistence.save(feedMap);

    console.log(`[Admin] Cleared ${worksCount} works + ${feedCount} feed posts`);
    res.json({ success: true, clearedWorks: worksCount, clearedFeedPosts: feedCount });
  });

  return router;
}
