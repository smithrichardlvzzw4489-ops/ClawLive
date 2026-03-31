import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  listEvolverEvents,
  listEvolverRounds,
  runEvolverRound,
} from '../../services/darwin-evolver-service';

export function evolverRoutes(): Router {
  const router = Router();

  router.get('/rounds', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 30));
      const rounds = await listEvolverRounds(userId, limit);
      res.json({ rounds });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list evolver rounds' });
    }
  });

  router.get('/rounds/:id/events', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const data = await listEvolverEvents(req.params.id, userId);
      if (!data) return res.status(404).json({ error: 'Not found' });
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load events' });
    }
  });

  /** 手动触发一轮（受最小间隔约束） */
  router.post('/run', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const r = await runEvolverRound(userId);
      if (!r.ok) return res.status(400).json({ error: r.reason });
      res.json({ roundId: r.roundId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to run evolver' });
    }
  });

  return router;
}
