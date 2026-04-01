import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import {
  addComment,
  cancelPoint,
  completePoint,
  tryCreateOrJoinSimilarOpenPoint,
  getComments,
  getPoint,
  getUserEvolutionObservation,
  initEvolutionNetwork,
  isEvolutionNetworkDisabled,
  listPoints,
  listRecommended,
  setLinkedSkills,
  toPublicPoint,
  type EvolutionLinkedSkill,
} from '../../services/evolution-network-service';
import {
  generateAcceptanceCasesForPoint,
  installLinkedSkillsForAuthor,
  runAcceptanceTestsForPoint,
} from '../../services/evolution-acceptance-service';

function evolutionWriteBlocked(res: Response): boolean {
  if (isEvolutionNetworkDisabled()) {
    res.status(403).json({ error: '进化网络已暂停' });
    return true;
  }
  return false;
}

export function evolutionNetworkRoutes(): Router {
  const router = Router();

  router.use((_req, _res, next) => {
    initEvolutionNetwork();
    next();
  });

  /** GET /api/evolution-network/my-observation — 当前用户与 Darwin 相关的进化行为时间线 */
  router.get('/my-observation', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { timeline, summary } = getUserEvolutionObservation(userId);
      res.json({ timeline, summary });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load evolution observation' });
    }
  });

  /** GET /api/evolution-network/points */
  router.get('/points', (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const list = listPoints(
        status === 'proposed' ||
          status === 'active' ||
          status === 'ended' ||
          status === 'evolving'
          ? { status: status as 'proposed' | 'active' | 'ended' | 'evolving' }
          : undefined,
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
      if (evolutionWriteBlocked(res)) return;
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
      const result = tryCreateOrJoinSimilarOpenPoint(userId, user.username, {
        title,
        goal,
        problems: Array.isArray(problems) ? problems : [],
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      const code = result.outcome === 'created' ? 201 : 200;
      res.status(code).json({
        point: toPublicPoint(result.point),
        outcome: result.outcome,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create evolution point' });
    }
  });

  /** POST /api/evolution-network/points/:id/join */
  router.post('/points/:id/join', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (evolutionWriteBlocked(res)) return;
      const userId = req.user!.id;
      const { body } = req.body as { body?: string };
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const result = addComment(req.params.id, userId, user.username, String(body || '加入'));
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to join' });
    }
  });

  /** PUT /api/evolution-network/points/:id/linked-skills — 发起者设置关联技能（重置验收） */
  router.put('/points/:id/linked-skills', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
      if (evolutionWriteBlocked(res)) return;
      const userId = req.user!.id;
      const raw = (req.body as { skills?: unknown })?.skills;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ error: 'skills 须为非空数组' });
      }
      const skills: EvolutionLinkedSkill[] = raw
        .filter((x) => x && typeof x === 'object' && typeof (x as { skillMarkdown?: string }).skillMarkdown === 'string')
        .map((x) => {
          const o = x as { id?: string; title?: string; skillMarkdown: string };
          return {
            id: o.id?.trim() ?? '',
            title: String(o.title ?? 'Skill'),
            skillMarkdown: o.skillMarkdown,
          };
        });
      const result = setLinkedSkills(req.params.id, userId, skills);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to set linked skills' });
    }
  });

  /** POST /api/evolution-network/points/:id/acceptance/generate — 生成验收用例 */
  router.post('/points/:id/acceptance/generate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (evolutionWriteBlocked(res)) return;
      const userId = req.user!.id;
      const result = await generateAcceptanceCasesForPoint(req.params.id, userId);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to generate acceptance cases' });
    }
  });

  /** POST /api/evolution-network/points/:id/acceptance/run — 运行验收测试 */
  router.post('/points/:id/acceptance/run', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (evolutionWriteBlocked(res)) return;
      const userId = req.user!.id;
      const result = await runAcceptanceTestsForPoint(req.params.id, userId);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const p = getPoint(req.params.id);
      res.json({
        success: true,
        passed: result.passed,
        results: result.results,
        point: p ? toPublicPoint(p) : null,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to run acceptance tests' });
    }
  });

  /** POST /api/evolution-network/points/:id/complete — 闭环；关联技能需验收通过后；完成后为发起者安装技能 */
  router.post('/points/:id/complete', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (evolutionWriteBlocked(res)) return;
      const userId = req.user!.id;
      const result = completePoint(req.params.id, userId);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const installed = await installLinkedSkillsForAuthor(req.params.id);
      const p = getPoint(req.params.id);
      res.json({ success: true, point: p ? toPublicPoint(p) : null, installedSkills: installed.installed });
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
