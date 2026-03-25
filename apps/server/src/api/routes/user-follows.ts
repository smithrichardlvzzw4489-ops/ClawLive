import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { isFollowing, follow, unfollow } from '../../services/user-follows';

export function userFollowsRoutes(): Router {
  const router = Router();

  router.use(authenticateToken);

  /**
   * GET /api/user-follows/check/:hostId
   * 检查当前用户是否关注了该主播
   */
  router.get('/check/:hostId', (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const hostId = req.params.hostId;
    const following = isFollowing(userId, hostId);
    res.json({ following });
  });

  /**
   * POST /api/user-follows/:hostId
   * 关注主播
   */
  router.post('/:hostId', (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const hostId = req.params.hostId;
    if (!hostId) return res.status(400).json({ error: 'hostId required' });
    if (String(userId) === String(hostId)) {
      return res.status(400).json({ error: '不能关注自己', code: 'SELF_FOLLOW' });
    }
    follow(userId, hostId);
    res.json({ success: true, following: true });
  });

  /**
   * DELETE /api/user-follows/:hostId
   * 取消关注
   */
  router.delete('/:hostId', (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const hostId = req.params.hostId;
    if (!hostId) return res.status(400).json({ error: 'hostId required' });
    unfollow(userId, hostId);
    res.json({ success: true, following: false });
  });

  return router;
}
