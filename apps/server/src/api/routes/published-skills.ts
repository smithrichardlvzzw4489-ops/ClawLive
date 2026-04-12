/**
 * /api/published-skills — 用户发布的付费社区技能市场
 *
 * 用户可以将掌握了外部 API Key 的工作流封装为付费 Skill 发布到平台，
 * 其他用户用积分调用，平台抽成后剩余积分结算给作者。
 *
 * Endpoints:
 *   GET  /api/published-skills              列出已审核通过的社区技能（需登录）
 *   GET  /api/published-skills/my           当前用户发布的技能（含审核状态）
 *   GET  /api/published-skills/credit-table 各工具积分收费表（需登录）
 *   GET  /api/published-skills/:id          技能详情
 *   POST /api/published-skills              发布新技能（提交审核）
 *   PATCH /api/published-skills/:id         更新（重置为 pending）
 *   DELETE /api/published-skills/:id        删除
 *
 *   Admin（需 x-admin-secret header）:
 *   GET  /api/published-skills/admin/pending
 *   POST /api/published-skills/admin/:id/approve
 *   POST /api/published-skills/admin/:id/reject
 */
import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getToolCreditTable } from '../../services/skill-credits';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

function isAdmin(req: Request): boolean {
  const secret = (req as AuthRequest).headers['x-admin-secret'];
  return Boolean(ADMIN_SECRET && secret === ADMIN_SECRET);
}

type SkillRow = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  creditCostPerCall: number;
  platformFeeRate: number;
  installCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  authorId?: string;
  skillMarkdown?: string;
  author?: { id: string; username: string; avatarUrl: string | null } | null;
};

function sanitize(s: SkillRow, includeMarkdown = false) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    tags: s.tags,
    creditCostPerCall: s.creditCostPerCall,
    platformFeeRate: s.platformFeeRate,
    installCount: s.installCount,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    author: s.author
      ? { id: s.author.id, username: s.author.username, avatarUrl: s.author.avatarUrl }
      : undefined,
    ...(includeMarkdown && s.skillMarkdown !== undefined ? { skillMarkdown: s.skillMarkdown } : {}),
  };
}

export function publishedSkillsRoutes(): IRouter {
  const router = Router();

  // ── 需登录的查询接口 ─────────────────────────────────────────────────────────

  /** 工具积分收费表 */
  router.get('/credit-table', authenticateToken, (_req: AuthRequest, res: Response) => {
    res.json({ tools: getToolCreditTable() });
  });

  /** 已审核通过的社区技能列表 */
  router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    const keyword = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10)));

    try {
      const where = {
        status: 'approved',
        ...(keyword
          ? {
              OR: [
                { title: { contains: keyword, mode: 'insensitive' as const } },
                { description: { contains: keyword, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(tag ? { tags: { has: tag } } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.publishedSkill.findMany({
          where,
          orderBy: [{ installCount: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, title: true, description: true, tags: true,
            creditCostPerCall: true, platformFeeRate: true, installCount: true,
            status: true, createdAt: true, updatedAt: true,
            author: { select: { id: true, username: true, avatarUrl: true } },
          },
        }),
        prisma.publishedSkill.count({ where }),
      ]);

      res.json({
        items: items.map((s) => sanitize(s as SkillRow)),
        total, page, pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (e) {
      console.error('GET /api/published-skills', e);
      res.status(500).json({ error: 'Failed to load skills' });
    }
  });

  // ── 需要登录 ─────────────────────────────────────────────────────────────────

  /** 我发布的技能（含审核状态） */
  router.get('/my', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    try {
      const items = await prisma.publishedSkill.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      });
      res.json({ items: items.map((s) => sanitize(s as SkillRow, true)) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load your skills' });
    }
  });

  /** 发布新技能（提交审核） */
  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const body = req.body as {
      title?: unknown; description?: unknown; skillMarkdown?: unknown;
      tags?: unknown; creditCostPerCall?: unknown;
    };

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const skillMarkdown = typeof body.skillMarkdown === 'string' ? body.skillMarkdown.trim() : '';
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string').slice(0, 10)
      : [];
    const creditCostPerCall = typeof body.creditCostPerCall === 'number'
      ? Math.max(0, Math.floor(body.creditCostPerCall))
      : 0;

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!skillMarkdown) return res.status(400).json({ error: 'skillMarkdown is required' });
    if (skillMarkdown.length > 20000) {
      return res.status(400).json({ error: 'skillMarkdown too long (max 20000 chars)' });
    }

    try {
      const skill = await prisma.publishedSkill.create({
        data: { authorId: userId, title, description: description || null, skillMarkdown, tags, creditCostPerCall, status: 'pending' },
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      });
      res.status(201).json(sanitize(skill as SkillRow, true));
    } catch (e) {
      console.error('POST /api/published-skills', e);
      res.status(500).json({ error: 'Failed to publish skill' });
    }
  });

  /** 技能详情 */
  router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    try {
      const skill = await prisma.publishedSkill.findUnique({
        where: { id },
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      });
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      if (skill.status !== 'approved' && skill.authorId !== userId && !isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      res.json(sanitize(skill as SkillRow, true));
    } catch (e) {
      res.status(500).json({ error: 'Failed to load skill' });
    }
  });

  /** 更新技能（重置为 pending） */
  router.patch('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const body = req.body as {
      title?: unknown; description?: unknown; skillMarkdown?: unknown;
      tags?: unknown; creditCostPerCall?: unknown;
    };

    try {
      const existing = await prisma.publishedSkill.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Skill not found' });
      if (existing.authorId !== userId && !isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

      const data: Record<string, unknown> = { status: 'pending' };
      if (typeof body.title === 'string') data.title = body.title.trim();
      if (typeof body.description === 'string') data.description = body.description.trim();
      if (typeof body.skillMarkdown === 'string') data.skillMarkdown = body.skillMarkdown.trim();
      if (Array.isArray(body.tags)) data.tags = body.tags.filter((t): t is string => typeof t === 'string').slice(0, 10);
      if (typeof body.creditCostPerCall === 'number') data.creditCostPerCall = Math.max(0, Math.floor(body.creditCostPerCall));

      const updated = await prisma.publishedSkill.update({
        where: { id }, data,
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      });
      res.json(sanitize(updated as SkillRow, true));
    } catch (e) {
      console.error('PATCH /api/published-skills/:id', e);
      res.status(500).json({ error: 'Failed to update skill' });
    }
  });

  /** 删除技能 */
  router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    try {
      const existing = await prisma.publishedSkill.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Skill not found' });
      if (existing.authorId !== userId && !isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await prisma.publishedSkill.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete skill' });
    }
  });

  // ── Admin ────────────────────────────────────────────────────────────────────

  /** 待审核列表 */
  router.get('/admin/pending', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const items = await prisma.publishedSkill.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      });
      res.json({ items: items.map((s) => sanitize(s as SkillRow, true)) });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load pending skills' });
    }
  });

  /** 审核通过 */
  router.post('/admin/:id/approve', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const updated = await prisma.publishedSkill.update({
        where: { id: req.params.id }, data: { status: 'approved' },
      });
      res.json({ ok: true, id: updated.id, status: updated.status });
    } catch (e) {
      res.status(500).json({ error: 'Failed to approve skill' });
    }
  });

  /** 审核拒绝 */
  router.post('/admin/:id/reject', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
    const reason = typeof (req.body as { reason?: unknown }).reason === 'string'
      ? (req.body as { reason: string }).reason.trim() : '';
    try {
      const updated = await prisma.publishedSkill.update({
        where: { id: req.params.id }, data: { status: 'rejected' },
      });
      if (reason) console.log(`[PublishedSkills] Rejected ${req.params.id}: ${reason}`);
      res.json({ ok: true, id: updated.id, status: updated.status });
    } catch (e) {
      res.status(500).json({ error: 'Failed to reject skill' });
    }
  });

  return router;
}
