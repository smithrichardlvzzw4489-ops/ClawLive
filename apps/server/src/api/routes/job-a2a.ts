import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  advanceAgentRound,
  getDashboard,
  getMatchDetail,
  postHumanMessage,
  runAutoMatch,
  unlockHumanChat,
  upsertEmployerProfile,
  upsertSeekerProfile,
} from '../../services/job-a2a-service';

export function jobA2ARoutes(): Router {
  const router = Router();

  /** GET /api/job-a2a/dashboard — 双端档案、匹配列表、监控时间线 */
  router.get('/dashboard', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = await getDashboard(req.user!.id);
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  /** PUT /api/job-a2a/seeker — 求职者 Darwin 建档 */
  router.put('/seeker', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const skills = Array.isArray(body.skills) ? (body.skills as unknown[]).map((x) => String(x)) : [];
      const row = await upsertSeekerProfile(req.user!.id, {
        title: String(body.title || '').trim() || '未命名意向',
        city: body.city != null ? String(body.city) : null,
        salaryMin: body.salaryMin != null ? Number(body.salaryMin) : null,
        salaryMax: body.salaryMax != null ? Number(body.salaryMax) : null,
        skills,
        narrative: String(body.narrative || ''),
        active: body.active !== false,
      });
      res.json({ profile: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to save seeker profile' });
    }
  });

  /** PUT /api/job-a2a/employer — 招聘方 Darwin 建档 */
  router.put('/employer', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const skills = Array.isArray(body.skills) ? (body.skills as unknown[]).map((x) => String(x)) : [];
      const row = await upsertEmployerProfile(req.user!.id, {
        jobTitle: String(body.jobTitle || '').trim() || '未命名岗位',
        city: body.city != null ? String(body.city) : null,
        salaryMin: body.salaryMin != null ? Number(body.salaryMin) : null,
        salaryMax: body.salaryMax != null ? Number(body.salaryMax) : null,
        skills,
        companyName: body.companyName != null ? String(body.companyName) : null,
        narrative: String(body.narrative || ''),
        active: body.active !== false,
      });
      res.json({ profile: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to save employer profile' });
    }
  });

  /** POST /api/job-a2a/run-match — 全平台自动匹配（实验室） */
  router.post('/run-match', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const r = await runAutoMatch();
      res.json(r);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to run matching' });
    }
  });

  /** GET /api/job-a2a/matches/:id */
  router.get('/matches/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const detail = await getMatchDetail(req.params.id, req.user!.id);
      if (!detail) return res.status(404).json({ error: 'Not found' });
      res.json(detail);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load match' });
    }
  });

  /** POST /api/job-a2a/matches/:id/agent-step — body: { rounds?: number } 默认 1，最大 10，连续推进多轮 Darwin 对聊 */
  router.post('/matches/:id/agent-step', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const raw = (req.body as { rounds?: unknown })?.rounds;
      const out = await advanceAgentRound(req.params.id, req.user!.id, {
        rounds: raw === undefined || raw === null ? undefined : Number(raw),
      });
      res.json(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('无权')) return res.status(403).json({ error: msg });
      if (msg.includes('不存在') || msg.includes('不可')) {
        return res.status(400).json({ error: msg });
      }
      console.error(e);
      res.status(500).json({ error: msg || 'Agent step failed' });
    }
  });

  /** POST /api/job-a2a/matches/:id/unlock-human */
  router.post('/matches/:id/unlock-human', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const m = await unlockHumanChat(req.params.id, req.user!.id);
      res.json({ match: m });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(400).json({ error: msg });
    }
  });

  /** POST /api/job-a2a/matches/:id/human-message */
  router.post('/matches/:id/human-message', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const body = String((req.body as { body?: string })?.body || '').trim();
      const out = await postHumanMessage(req.params.id, req.user!.id, body);
      res.json(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(400).json({ error: msg });
    }
  });

  return router;
}
