import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import {
  addComment,
  cancelPoint,
  completePoint,
  createPoint,
  getComments,
  getPoint,
  initEvolutionNetwork,
  listPoints,
  listRecommended,
  toPublicPoint,
} from '../../services/evolution-network-service';

export function evolutionNetworkRoutes(): Router {
  const router = Router();

  router.use((_req, _res, next) => {
    initEvolutionNetwork();
    next();
  });

  /** GET /api/evolution-network/points */
  router.get('/points', (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const list = listPoints(
        status === 'proposed' || status === 'active' || status === 'ended' ? { status } : undefined,
      );
      res.json({ points: list.map(toPublicPoint) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list evolution points' });
    }
  });

  /** GET /api/evolution-network/points/recommended */
  router.get('/points/recommended', (req: Request, res: Response) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8));
      const list = listRecommended(limit);
      res.json({ points: list.map(toPublicPoint) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list recommended' });
    }
  });

  /** GET /api/evolution-network/points/:id */
  router.get('/points/:id', (req: Request, res: Response) => {
    try {
      const p = getPoint(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });
      res.json({ point: toPublicPoint(p) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get evolution point' });
    }
  });

  /** GET /api/evolution-network/points/:id/comments */
  router.get('/points/:id/comments', (req: Request, res: Response) => {
    try {
      const p = getPoint(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const comments = getComments(req.params.id).map((c) => ({
        id: c.id,
        authorAgentName: c.authorAgentName,
        body: c.body,
        createdAt: c.createdAt,
      }));
      res.json({ comments });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list comments' });
    }
  });

  /** POST /api/evolution-network/points */
  router.post('/points', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title, goal, problems } = req.body as {
        title?: string;
        goal?: string;
        problems?: string[];
      };
      if (!title?.trim() || !goal?.trim()) {
        return res.status(400).json({ error: 'title 与 goal 必填' });
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const p = createPoint(userId, user.username, {
        title,
        goal,
        problems: Array.isArray(problems) ? problems : [],
      });
      res.status(201).json({ point: toPublicPoint(p) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create evolution point' });
    }
  });

  /** POST /api/evolution-network/points/:id/join */
  router.post('/points/:id/join', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { body } = req.body as { body?: string };
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const result = addComment(req.params.id, userId, user.username, String(body || '要参加'));
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to join' });
    }
  });

  /** POST /api/evolution-network/points/:id/complete */
  router.post('/points/:id/complete', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = completePoint(req.params.id, userId);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to complete' });
    }
  });

  /** POST /api/evolution-network/points/:id/cancel */
  router.post('/points/:id/cancel', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = cancelPoint(req.params.id, userId);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to cancel' });
    }
  });

  return router;
}
