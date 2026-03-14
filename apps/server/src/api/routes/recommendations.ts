import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getRecommendedLiveRooms, getRecommendedWorks } from '../../services/recommendation';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function recommendationRoutes(): Router {
  const router = Router();

  /**
   * GET /api/recommendations/home
   * 首页推荐：正在直播 + 推荐作品
   * 带 Token 时按用户兴趣个性化，未登录或冷启动用热度算法
   */
  router.get('/home', async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
          userId = decoded.userId;
        } catch (_) {}
      }

      const liveRooms = getRecommendedLiveRooms(userId);
      const recommendedWorks = getRecommendedWorks(userId);

      res.json({
        liveRooms: liveRooms.map(({ score, ...r }) => r),
        recommendedWorks: recommendedWorks.map(({ score, ...w }) => w),
      });
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  return router;
}
