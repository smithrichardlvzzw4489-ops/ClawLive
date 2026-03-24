/**
 * 创作者列表 API
 * GET /api/creators - 返回所有有内容的创作者（来自作品、能力流、直播）
 */
import { Router, Request, Response } from 'express';
import { getAllRooms } from '../../lib/rooms-store';
import { works, getHostInfoBatch } from './rooms-simple';
import { SkillsPersistence } from '../../services/skills-persistence';
import { CommunityPersistence } from '../../services/community-persistence';

export function creatorsRoutes(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, parseInt(String(req.query.limit || 30), 10) || 30);
      const authorIds = new Set<string>();

      for (const w of works.values()) {
        if (w.status === 'published') authorIds.add(w.authorId);
      }
      const skills = SkillsPersistence.loadAll();
      for (const s of skills.values()) {
        authorIds.add(s.authorId);
      }
      const rooms = await getAllRooms();
      for (const r of rooms) {
        authorIds.add(r.hostId);
      }
      const posts = CommunityPersistence.loadPosts();
      for (const p of posts.values()) {
        authorIds.add(p.authorId);
      }

      const ids = Array.from(authorIds);
      const authorMap = await getHostInfoBatch(ids);
      const list = ids
        .map((id) => authorMap.get(id))
        .filter((a): a is NonNullable<typeof a> => !!a && a.id !== 'official')
        .map((a) => ({ id: a.id, username: a.username, avatarUrl: a.avatarUrl ?? undefined }));

      const unique = Array.from(new Map(list.map((x) => [x.id, x])).values()).slice(0, limit);
      res.json({ creators: unique });
    } catch (error) {
      console.error('Creators list error:', error);
      res.status(500).json({ error: 'Failed to fetch creators' });
    }
  });

  return router;
}
