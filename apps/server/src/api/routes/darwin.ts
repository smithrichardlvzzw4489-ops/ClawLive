import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import {
  cloneInstalledSkillsFromUser,
  getDarwinPublicProfile,
  listDarwinDirectory,
} from '../../services/darwin-showcase';

export function darwinRoutes(): Router {
  const router = Router();

  /** GET /api/darwin/directory — 已接入 Darwin 的用户列表（技能数、进化点数等） */
  router.get('/directory', async (req, res: Response) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 24));
      const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
      const data = await listDarwinDirectory(limit, offset);
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list GITLINK directory' });
    }
  });

  /** GET /api/darwin/profile/:username — 单只 Darwin 的公开进化档案 */
  router.get('/profile/:username', async (req, res: Response) => {
    try {
      const username = decodeURIComponent(String(req.params.username || '').trim());
      if (!username) {
        return res.status(400).json({ error: 'username required' });
      }
      const profile = await getDarwinPublicProfile(username);
      if (!profile) {
        return res.status(404).json({ error: 'GITLINK profile not found' });
      }
      res.json({ profile });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  /**
   * POST /api/darwin/clone-skills
   * body: { sourceUserId: string } 或 { sourceUsername: string }
   * 将对方已安装技能全部复制到当前账号（需登录）
   */
  router.post('/clone-skills', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const targetUserId = req.user!.id;
      let sourceUserId = String((req.body as { sourceUserId?: string }).sourceUserId || '').trim();
      const sourceUsername = String((req.body as { sourceUsername?: string }).sourceUsername || '').trim();

      if (!sourceUserId && sourceUsername) {
        const u = await prisma.user.findUnique({
          where: { username: sourceUsername },
          select: { id: true, darwinOnboarding: true },
        });
        if (!u) {
          return res.status(404).json({ error: '用户不存在' });
        }
        if (u.darwinOnboarding == null) {
          return res.status(400).json({ error: '该用户未接入 GITLINK，无法克隆' });
        }
        sourceUserId = u.id;
      }

      if (!sourceUserId) {
        return res.status(400).json({ error: '请提供 sourceUserId 或 sourceUsername' });
      }

      const source = await prisma.user.findUnique({
        where: { id: sourceUserId },
        select: { darwinOnboarding: true },
      });
      if (!source?.darwinOnboarding) {
        return res.status(400).json({ error: '源用户未接入 GITLINK' });
      }

      const { copied } = await cloneInstalledSkillsFromUser(targetUserId, sourceUserId);
      res.json({ ok: true, copied, message: copied ? `已合并 ${copied} 个技能到你的账号` : '对方暂无已安装技能' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('不能克隆自己')) {
        return res.status(400).json({ error: msg });
      }
      console.error(e);
      res.status(500).json({ error: '克隆失败' });
    }
  });

  return router;
}
