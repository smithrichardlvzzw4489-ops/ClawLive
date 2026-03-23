import { Router, Request, Response } from 'express';
import { getAllRooms } from '../../lib/rooms-store';
import { works, workMessages, getHostInfoBatch } from './rooms-simple';
import { prisma } from '../../lib/prisma';

const DEFAULT_PARTITION = 'general';

/**
 * 统一搜索 API：搜索直播、作品、UP主
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

      res.json({
        rooms,
        works: worksList,
        hosts: users,
      });
    } catch (error) {
      console.error('[search] Error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}
