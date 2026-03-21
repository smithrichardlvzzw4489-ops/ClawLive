import { Router, Request, Response } from 'express';
import { recordBehavior } from '../../services/user-behavior';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { liveHistory, works } from './rooms-simple';
import { getRoom } from '../../lib/rooms-store';

export function behaviorRoutes(): Router {
  const router = Router();

  /**
   * POST /api/behavior/track
   * 上报用户行为（隐式反馈），用于个性化推荐
   * 需要登录
   */
  router.post('/track', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { type, targetId } = req.body as { type: string; targetId: string };

      if (!type || !targetId) {
        return res.status(400).json({ error: 'type and targetId required' });
      }

      switch (type) {
        case 'work_view': {
          const work = works.get(targetId);
          if (!work || work.status !== 'published') break;
          recordBehavior({
            userId,
            type: 'work_view',
            targetId,
            authorId: work.authorId,
            tags: work.tags,
            lobsterName: work.lobsterName,
          });
          break;
        }
        case 'room_join': {
          const room = await getRoom(targetId);
          if (!room) break;
          recordBehavior({
            userId,
            type: 'room_join',
            targetId,
            hostId: room.hostId,
            lobsterName: room.lobsterName,
          });
          break;
        }
        case 'history_view': {
          const history = liveHistory.get(targetId);
          if (!history) break;
          recordBehavior({
            userId,
            type: 'history_view',
            targetId,
            hostId: history.hostId,
            lobsterName: history.lobsterName,
          });
          break;
        }
        case 'work_like': {
          const work = works.get(targetId);
          if (!work || work.status !== 'published') break;
          recordBehavior({
            userId,
            type: 'work_like',
            targetId,
            authorId: work.authorId,
            tags: work.tags,
            lobsterName: work.lobsterName,
          });
          break;
        }
        default:
          return res.status(400).json({ error: 'Invalid type. Use: work_view, room_join, history_view, work_like' });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Error tracking behavior:', error);
      res.status(500).json({ error: 'Failed to track' });
    }
  });

  return router;
}
