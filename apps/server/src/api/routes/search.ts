import { Router, Request, Response } from 'express';
import { getAllRooms } from '../../lib/rooms-store';
import { works, workMessages, getHostInfoBatch } from './rooms-simple';
import { prisma } from '../../lib/prisma';
import { loadOfficialSkills } from '../../services/official-skills-loader';
import { SkillsPersistence } from '../../services/skills-persistence';

const DEFAULT_PARTITION = 'general';

/**
 * 统一搜索 API：搜索直播、作品、UP主、Skill
 * GET /api/search?q=关键词
 */
export function searchRoutes(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string)?.trim();
      if (!q) {
        return res.json({
          rooms: [],
          works: [],
          hosts: [],
          skills: [],
        });
      }

      const searchLower = q.toLowerCase();

      // 1. 搜索直播房间
      const allRooms = await getAllRooms();
      const roomHostIds = [...new Set(allRooms.map((r) => r.hostId))];
      const hostMap = await getHostInfoBatch(roomHostIds);

      const roomsFiltered = allRooms.filter((room) => {
        const host = hostMap.get(room.hostId);
        const hostUsername = host?.username?.toLowerCase() ?? '';
        return (
          room.title.toLowerCase().includes(searchLower) ||
          room.lobsterName.toLowerCase().includes(searchLower) ||
          (room.description?.toLowerCase().includes(searchLower) ?? false) ||
          hostUsername.includes(searchLower)
        );
      });

      const rooms = roomsFiltered.map((room) => {
        const host = hostMap.get(room.hostId) ?? { id: room.hostId, username: 'Unknown', avatarUrl: null };
        return {
          id: room.id,
          title: room.title,
          lobsterName: room.lobsterName,
          description: room.description,
          viewerCount: room.viewerCount,
          isLive: room.isLive,
          startedAt: room.startedAt,
          host: { id: host.id, username: host.username, avatarUrl: host.avatarUrl ?? null },
        };
      });

      // 2. 搜索作品（已发布）
      const publishedWorks = Array.from(works.values()).filter((w) => w.status === 'published');
      const authorIds = [...new Set(publishedWorks.map((w) => w.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);

      const worksFiltered = publishedWorks.filter((work) => {
        const author = authorMap.get(work.authorId);
        const authorUsername = author?.username?.toLowerCase() ?? '';
        return (
          work.title.toLowerCase().includes(searchLower) ||
          work.description?.toLowerCase().includes(searchLower) ||
          work.resultSummary?.toLowerCase().includes(searchLower) ||
          work.lobsterName.toLowerCase().includes(searchLower) ||
          authorUsername.includes(searchLower)
        );
      });

      const worksList = worksFiltered.map((work) => {
        const author = authorMap.get(work.authorId);
        return {
          id: work.id,
          title: work.title,
          description: work.description,
          resultSummary: work.resultSummary,
          partition: work.partition || DEFAULT_PARTITION,
          lobsterName: work.lobsterName,
          coverImage: work.coverImage,
          videoUrl: work.videoUrl,
          tags: work.tags || [],
          viewCount: work.viewCount,
          likeCount: work.likeCount,
          messageCount: (workMessages.get(work.id) || work.messages || []).length,
          publishedAt: work.publishedAt,
          author: author
            ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
            : { id: work.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      // 按发布时间排序
      worksList.sort((a, b) => {
        const pa = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const pb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return pb - pa;
      });

      // 3. 搜索 UP主（用户/主播）
      let users: { id: string; username: string; avatarUrl: string | null }[] = [];
      try {
        const dbUsers = await prisma.user.findMany({
          where: {
            username: {
              contains: searchLower,
              mode: 'insensitive',
            },
          },
          select: { id: true, username: true, avatarUrl: true },
          take: 20,
        });
        users = dbUsers.map((u) => ({
          id: u.id,
          username: u.username,
          avatarUrl: u.avatarUrl ?? null,
        }));
      } catch (e) {
        console.warn('[search] User search failed:', e);
      }

      // 4. 搜索 Skill（官方 + 用户）
      const skillsMap = SkillsPersistence.loadAll();
      const officialList = loadOfficialSkills();
      const allSkillsForSearch: Array<{
        id: string;
        title: string;
        description?: string;
        partition: string;
        sourceType: 'official' | 'user-work' | 'user-direct';
        tags: string[];
        viewCount: number;
        useCount: number;
        author: { id: string; username: string; avatarUrl?: string | null };
      }> = [];

      for (const s of officialList) {
        const match =
          s.title.toLowerCase().includes(searchLower) ||
          (s.description?.toLowerCase().includes(searchLower) ?? false) ||
          (s.tags || []).some((t) => t.toLowerCase().includes(searchLower));
        if (match) {
          allSkillsForSearch.push({
            id: s.id,
            title: s.title,
            description: s.description,
            partition: s.partition || DEFAULT_PARTITION,
            sourceType: 'official',
            tags: s.tags || [],
            viewCount: 0,
            useCount: 0,
            author: { id: 'official', username: '官方', avatarUrl: null },
          });
        }
      }

      const userSkills = Array.from(skillsMap.values());
      const skillAuthorIds = [...new Set(userSkills.map((s) => s.authorId))];
      const skillAuthorMap = await getHostInfoBatch(skillAuthorIds);

      for (const s of userSkills) {
        const author = skillAuthorMap.get(s.authorId);
        const authorUsername = author?.username?.toLowerCase() ?? '';
        const match =
          s.title.toLowerCase().includes(searchLower) ||
          (s.description?.toLowerCase().includes(searchLower) ?? false) ||
          (s.tags || []).some((t) => t.toLowerCase().includes(searchLower)) ||
          authorUsername.includes(searchLower);
        if (match) {
          allSkillsForSearch.push({
            id: s.id,
            title: s.title,
            description: s.description,
            partition: s.partition || DEFAULT_PARTITION,
            sourceType: s.sourceWorkId ? 'user-work' : 'user-direct',
            tags: s.tags || [],
            viewCount: s.viewCount,
            useCount: s.useCount,
            author: author
              ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl ?? null }
              : { id: s.authorId, username: 'Unknown', avatarUrl: null },
          });
        }
      }

      allSkillsForSearch.sort((a, b) => (b.viewCount + b.useCount * 2) - (a.viewCount + a.useCount * 2));

      res.json({
        rooms,
        works: worksList,
        hosts: users,
        skills: allSkillsForSearch,
      });
    } catch (error) {
      console.error('[search] Error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}
