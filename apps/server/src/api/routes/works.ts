import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from '../../lib/data-path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { works, workMessages, userProfiles, getHostInfo, getHostInfoBatch, mergeWorksFromDisk } from './rooms-simple';
import { getAllRooms, getRoom, getMessageHistory } from '../../lib/rooms-store';
import { WorksPersistence } from '../../services/works-persistence';
import { mtprotoService } from '../../services/telegram-mtproto';
import { workAgentConfigs } from './work-agent-config';
import { recordBehavior } from '../../services/user-behavior';
import { isValidPartition, DEFAULT_PARTITION } from '../../lib/work-partitions';
import { generateResultSummary } from '../../services/llm';
import { createSkillFromWork } from './skills';
import {
  getWorkComments,
  getWorkCommentCount,
  addWorkComment,
} from '../../services/work-comments-store';
import { getShareCount, incrementShareCount } from '../../services/work-share-stats';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

function parseCoverDataUrl(dataUrl: string): { buf: Buffer; ext: string } | null {
  if (!dataUrl.startsWith('data:')) return null;
  const m = dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  let ext = 'png';
  if (mime.includes('jpeg') || mime === 'jpg') ext = 'jpg';
  else if (mime === 'png') ext = 'png';
  else if (mime === 'gif') ext = 'gif';
  else if (mime === 'webp') ext = 'webp';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_COVER_BYTES) return null;
  return { buf, ext };
}

export function worksRoutes(io: Server): Router {
  const router = Router();
  // Force reload

  // GET /api/works - 获取所有已发布的作品
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { authorId, tag, search, partition } = req.query;
      
      let publishedWorks = Array.from(works.values()).filter(work => work.status === 'published');

      // Filter by partition
      if (partition && typeof partition === 'string') {
        publishedWorks = publishedWorks.filter(w => (w.partition || DEFAULT_PARTITION) === partition);
      }
      const authorIds = [...new Set(publishedWorks.map(w => w.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);

      let worksList = publishedWorks.map(work => {
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
          messageCount: work.messages.length,
          publishedAt: work.publishedAt,
          contentKind: work.contentKind,
          author: author ? {
            id: author.id,
            username: author.username,
            avatarUrl: author.avatarUrl,
          } : {
            id: work.authorId,
            username: 'Unknown',
            avatarUrl: null,
          },
        };
      });

      // Filter by author
      if (authorId) {
        worksList = worksList.filter(w => w.author.id === authorId);
      }

      // Filter by tag
      if (tag) {
        worksList = worksList.filter(w => w.tags.includes(tag as string));
      }

      // Search by title/description
      if (search) {
        const searchLower = (search as string).toLowerCase();
        worksList = worksList.filter(w => 
          w.title.toLowerCase().includes(searchLower) ||
          w.description?.toLowerCase().includes(searchLower)
        );
      }

      // Sort by published date (newest first)
      worksList.sort((a, b) => {
        if (!a.publishedAt || !b.publishedAt) return 0;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

      res.json({
        works: worksList,
        total: worksList.length,
      });
    } catch (error) {
      console.error('Error fetching works:', error);
      res.status(500).json({ error: 'Failed to fetch works' });
    }
  });

  // GET /api/works/:workId/comments
  router.get('/:workId/comments', async (req: Request, res: Response) => {
    try {
      const { workId } = req.params;
      const work = works.get(workId);
      if (!work) return res.status(404).json({ error: 'Work not found' });
      if (work.status !== 'published') {
        return res.json({ comments: [] });
      }
      const list = getWorkComments(workId);
      const authorIds = [...new Set(list.map((c) => c.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);
      const comments = list.map((c) => {
        const a = authorMap.get(c.authorId);
        const created =
          c.createdAt instanceof Date ? c.createdAt.toISOString() : new Date(c.createdAt).toISOString();
        return {
          id: c.id,
          content: c.content,
          createdAt: created,
          author: a
            ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl }
            : { id: c.authorId, username: 'Unknown', avatarUrl: null as string | null },
        };
      });
      res.json({ comments });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list comments' });
    }
  });

  // POST /api/works/:workId/comments
  router.post('/:workId/comments', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const work = works.get(workId);
      if (!work) return res.status(404).json({ error: 'Work not found' });
      if (work.status !== 'published') {
        return res.status(403).json({ error: 'Comments only on published works' });
      }
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!content.trim()) {
        return res.status(400).json({ error: 'content required' });
      }
      const userId = req.user!.id;
      const c = addWorkComment(workId, userId, content);
      const author = await getHostInfo(userId);
      res.status(201).json({
        comment: {
          id: c.id,
          content: c.content,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : new Date(c.createdAt).toISOString(),
          author: author
            ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
            : { id: userId, username: 'Unknown', avatarUrl: null },
        },
      });
    } catch (e: any) {
      if (e?.message === 'empty') {
        return res.status(400).json({ error: 'content required' });
      }
      console.error(e);
      res.status(500).json({ error: 'Failed to post comment' });
    }
  });

  // POST /api/works/:workId/share — 记录一次分享（复制链接成功后由前端调用）
  router.post('/:workId/share', async (req: Request, res: Response) => {
    try {
      const { workId } = req.params;
      const w = works.get(workId);
      if (!w || w.status !== 'published') {
        return res.status(404).json({ error: 'Work not found' });
      }
      const next = incrementShareCount(workId);
      res.json({ shareCount: next });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to record share' });
    }
  });

  // GET /api/works/:workId - 获取作品详情
  router.get('/:workId', async (req: Request, res: Response) => {
    try {
      const { workId } = req.params;
      const work = works.get(workId);

      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      // Only published works are publicly accessible
      if (work.status !== 'published') {
        // Check if requester is author
        const token = req.headers.authorization?.replace('Bearer ', '');
        console.log(`🔐 Checking access for draft work ${workId}`);
        console.log(`  - Work authorId: ${work.authorId}`);
        console.log(`  - Token present: ${!!token}`);
        
        if (!token) {
          console.log('  ❌ No token provided');
          return res.status(403).json({ error: 'Access denied' });
        }

        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
          console.log(`  - Decoded user id: ${decoded.userId}`);
          
          if (decoded.userId !== work.authorId) {
            console.log('  ❌ User is not author');
            return res.status(403).json({ error: 'Access denied' });
          }
          console.log('  ✅ Access granted');
        } catch (error) {
          console.error('  ❌ JWT verify failed:', error);
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      // Increment view count
      work.viewCount++;
      works.set(workId, work);
      // 浏览计数不持久化，避免频繁写盘

      // 记录浏览行为（用于个性化推荐），登录用户且非本人作品
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token && work.authorId) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
          if (decoded.userId !== work.authorId) {
            recordBehavior({
              userId: decoded.userId,
              type: 'work_view',
              targetId: workId,
              authorId: work.authorId,
              tags: work.tags,
              lobsterName: work.lobsterName,
            });
          }
        } catch (_) {}
      }

      const author = await getHostInfo(work.authorId);

      const allRooms = await getAllRooms();
      const authorLiveRoom = allRooms.find(r => r.hostId === work.authorId && r.isLive);

      res.json({
        ...work,
        shareCount: getShareCount(workId),
        commentCount: getWorkCommentCount(workId),
        author: {
          id: author.id,
          username: author.username,
          avatarUrl: author.avatarUrl,
        },
        authorLiveRoom: authorLiveRoom ? {
          id: authorLiveRoom.id,
          title: authorLiveRoom.title,
          lobsterName: authorLiveRoom.lobsterName,
          viewerCount: authorLiveRoom.viewerCount,
        } : null,
      });
    } catch (error) {
      console.error('Error fetching work:', error);
      res.status(500).json({ error: 'Failed to fetch work' });
    }
  });

  // POST /api/works/convert-from-chat - 直播/Inbox 对话一键转作品
  router.post('/convert-from-chat', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { sourceType, roomId } = req.body as { sourceType?: 'live' | 'inbox'; roomId?: string };

      const chatRoomId = sourceType === 'inbox' ? `inbox-${userId}` : roomId;
      if (!chatRoomId) {
        return res.status(400).json({ error: 'roomId required for live, sourceType=inbox for inbox' });
      }

      if (sourceType === 'live') {
        const room = await getRoom(roomId!);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.hostId !== userId) return res.status(403).json({ error: 'Only room host can convert' });
      } else if (sourceType === 'inbox') {
        if (chatRoomId !== `inbox-${userId}`) return res.status(403).json({ error: 'Invalid inbox' });
      } else {
        return res.status(400).json({ error: 'sourceType must be live or inbox' });
      }

      const rawMessages = await getMessageHistory(chatRoomId);
      if (rawMessages.length === 0) {
        return res.status(400).json({ error: 'No messages to convert' });
      }

      const workMessagesList = rawMessages.map((m) => ({
        id: m.id,
        workId: '' as string,
        sender: (m.sender === 'host' ? 'user' : 'agent') as 'user' | 'agent',
        content: m.content,
        timestamp: m.timestamp,
      }));

      let title: string;
      let lobsterName: string;

      if (sourceType === 'live') {
        const room = await getRoom(roomId!);
        title = room?.title || '直播对话';
        lobsterName = room?.lobsterName || '小龙';
      } else {
        title = 'Inbox 对话';
        lobsterName = '小龙';
      }

      const workId = `work-${Date.now()}`;
      workMessagesList.forEach((m) => { m.workId = workId; });

      const newWork = {
        id: workId,
        authorId: userId,
        title,
        description: '',
        resultSummary: undefined as string | undefined,
        skillMarkdown: undefined as string | undefined,
        partition: DEFAULT_PARTITION,
        lobsterName,
        status: 'draft' as const,
        messages: workMessagesList,
        tags: [],
        coverImage: undefined,
        videoUrl: undefined,
        viewCount: 0,
        likeCount: 0,
        createdAt: new Date(),
        publishedAt: undefined,
        updatedAt: new Date(),
      };

      works.set(workId, newWork);
      workMessages.set(workId, workMessagesList);
      WorksPersistence.saveAll(works, workMessages);

      console.log(`✅ Work converted from ${sourceType}: ${workId} (${workMessagesList.length} messages)`);
      res.status(201).json({ workId });
    } catch (error) {
      console.error('Error converting to work:', error);
      res.status(500).json({ error: 'Failed to convert' });
    }
  });

  // POST /api/works - 创建新作品
  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title, description, lobsterName, contentKind } = req.body as {
        title?: string;
        description?: string;
        lobsterName?: string;
        contentKind?: string;
      };

      const isVideo = contentKind === 'video';
      const nameRaw = typeof lobsterName === 'string' ? lobsterName.trim() : '';
      const effectiveLobster = nameRaw || (isVideo ? '小龙' : '');

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'Title and lobster name are required' });
      }
      if (!effectiveLobster) {
        return res.status(400).json({ error: 'Title and lobster name are required' });
      }

      const workId = `work-${Date.now()}`;
      const newWork = {
        id: workId,
        authorId: userId,
        title: String(title).trim(),
        description: description || '',
        resultSummary: undefined as string | undefined,
        skillMarkdown: undefined as string | undefined,
        partition: DEFAULT_PARTITION,
        lobsterName: effectiveLobster,
        ...(isVideo ? { contentKind: 'video' as const } : {}),
        status: 'draft' as const,
        messages: [],
        tags: [],
        coverImage: undefined,
        videoUrl: undefined,
        viewCount: 0,
        likeCount: 0,
        createdAt: new Date(),
        publishedAt: undefined,
        updatedAt: new Date(),
      };

      works.set(workId, newWork);
      workMessages.set(workId, []);
      WorksPersistence.saveAll(works, workMessages);

      console.log(`✅ Work created: ${workId} by user ${userId}`);
      res.status(201).json(newWork);
    } catch (error) {
      console.error('Error creating work:', error);
      res.status(500).json({ error: 'Failed to create work' });
    }
  });

  // POST /api/works/:workId/upload-video - 上传摄像头录制的视频
  router.post('/:workId/upload-video', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { video } = req.body as { video?: string };

      if (!video || typeof video !== 'string') {
        return res.status(400).json({ error: 'Video data is required (base64)' });
      }

      const work = works.get(workId);
      if (!work) return res.status(404).json({ error: 'Work not found' });
      if (work.authorId !== userId) return res.status(403).json({ error: 'Not authorized' });
      if (work.status === 'published') return res.status(400).json({ error: 'Cannot edit published work' });

      // 解析 base64：支持 "data:video/webm;base64,xxx" 或纯 base64
      let base64Data = video;
      let ext = 'webm';
      if (video.startsWith('data:')) {
        const match = video.match(/^data:(video\/[^;]+);base64,/);
        if (match) {
          if (match[1].includes('webm')) ext = 'webm';
          else if (match[1].includes('mp4')) ext = 'mp4';
        }
        base64Data = video.split(',')[1] || video;
      }
      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length === 0) return res.status(400).json({ error: 'Invalid video data' });

      const uploadDir = join(UPLOADS_DIR, 'works', workId);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
      const filename = `${uuidv4()}.${ext}`;
      const filepath = join(uploadDir, filename);
      writeFileSync(filepath, buf);

      // 返回相对路径，前端用 NEXT_PUBLIC_API_URL 补全，避免 baseUrl 配置错误导致播放失败
      const url = `/uploads/works/${workId}/${filename}`;
      console.log(`📹 Video uploaded for work ${workId}: ${filename}`);
      res.json({ url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error uploading video:', error);
      res.status(500).json({ error: `视频上传失败: ${msg}` });
    }
  });

  // POST /api/works/:workId/upload-cover — 封面上传（data URL，用于视频投稿或自定义封面）
  router.post('/:workId/upload-cover', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { image } = req.body as { image?: string };

      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: 'image data URL required' });
      }

      const work = works.get(workId);
      if (!work) return res.status(404).json({ error: 'Work not found' });
      if (work.authorId !== userId) return res.status(403).json({ error: 'Not authorized' });
      if (work.status === 'published') return res.status(400).json({ error: 'Cannot edit published work' });

      const parsed = parseCoverDataUrl(image);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid image or file too large (max 5MB)' });
      }

      const uploadDir = join(UPLOADS_DIR, 'works', workId);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
      const filename = `cover-${uuidv4()}.${parsed.ext}`;
      const filepath = join(uploadDir, filename);
      writeFileSync(filepath, parsed.buf);

      const url = `/uploads/works/${workId}/${filename}`;
      work.coverImage = url;
      work.updatedAt = new Date();
      works.set(workId, work);
      WorksPersistence.saveAll(works, workMessages);
      res.json({ url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error uploading cover:', error);
      res.status(500).json({ error: `封面上传失败: ${msg}` });
    }
  });

  // PUT /api/works/:workId - 更新作品信息
  router.put('/:workId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { title, description, resultSummary, skillMarkdown, partition, tags, coverImage, videoUrl, contentKind } =
        req.body;

      const work = works.get(workId);
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      if (work.authorId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (work.status === 'draft' && contentKind === 'video') {
        work.contentKind = 'video';
      }

      if (title) work.title = title;
      if (description !== undefined) work.description = description;
      if (resultSummary !== undefined) work.resultSummary = resultSummary === '' ? undefined : resultSummary;
      if (skillMarkdown !== undefined) work.skillMarkdown = skillMarkdown === '' ? undefined : skillMarkdown;
      if (partition !== undefined && isValidPartition(partition)) work.partition = partition;
      if (tags) work.tags = tags;
      if (coverImage !== undefined) work.coverImage = coverImage;
      if (videoUrl !== undefined) work.videoUrl = videoUrl === '' || videoUrl === null ? undefined : videoUrl;
      work.updatedAt = new Date();

      works.set(workId, work);
      WorksPersistence.saveAll(works, workMessages);
      res.json(work);
    } catch (error) {
      console.error('Error updating work:', error);
      res.status(500).json({ error: 'Failed to update work' });
    }
  });

  // POST /api/works/:workId/generate-result-summary - 调用 LLM 生成一句话结果
  router.post('/:workId/generate-result-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;

      const work = works.get(workId);
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      if (work.authorId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const messages = workMessages.get(workId) || [];
      const summary = await generateResultSummary({
        title: work.title,
        lobsterName: work.lobsterName,
        messages: messages.map((m) => ({ sender: m.sender, content: m.content })),
      });

      res.json({ resultSummary: summary });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '生成失败';
      console.error('Error generating result summary:', error);
      res.status(500).json({ error: msg });
    }
  });

  // POST /api/works/:workId/publish - 发布作品
  router.post('/:workId/publish', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { videoUrl, resultSummary, skillMarkdown, partition, listToMarket } = req.body || {};

      const work = works.get(workId);
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      if (work.authorId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (work.status === 'published') {
        return res.status(400).json({ error: 'Work already published' });
      }

      if (work.contentKind === 'video') {
        const v = (videoUrl !== undefined && videoUrl !== null && String(videoUrl).trim() !== '')
          ? String(videoUrl).trim()
          : (work.videoUrl && String(work.videoUrl).trim()) || '';
        const c = (work.coverImage && String(work.coverImage).trim()) || '';
        if (!v) {
          return res.status(400).json({ error: '请先上传视频后再发布' });
        }
        if (!c) {
          return res.status(400).json({ error: '请设置封面图后再发布' });
        }
      }

      const finalPartition = partition && isValidPartition(partition) ? partition : DEFAULT_PARTITION;
      work.partition = finalPartition;

      // 发布时确保包含视频内容（客户端传入的 videoUrl 优先）
      if (videoUrl !== undefined && videoUrl !== null && videoUrl !== '') {
        work.videoUrl = videoUrl;
      }
      if (resultSummary !== undefined && resultSummary !== null && resultSummary !== '') {
        work.resultSummary = resultSummary;
      }
      if (skillMarkdown !== undefined && skillMarkdown !== null && skillMarkdown !== '') {
        work.skillMarkdown = skillMarkdown;
      }

      // Save messages to work
      const messages = workMessages.get(workId) || [];
      work.messages = messages;
      work.status = 'published';
      work.publishedAt = new Date();
      work.updatedAt = new Date();

      works.set(workId, work);
      WorksPersistence.saveAll(works, workMessages);

      if (listToMarket && work.skillMarkdown?.trim()) {
        createSkillFromWork({
          authorId: userId,
          title: work.title,
          description: work.resultSummary,
          skillMarkdown: work.skillMarkdown,
          partition: finalPartition,
          sourceWorkId: workId,
          tags: work.tags || [],
        });
      }

      console.log(`📤 Work published: ${workId}`);
      res.json(work);
    } catch (error) {
      console.error('Error publishing work:', error);
      res.status(500).json({ error: 'Failed to publish work' });
    }
  });

  // DELETE /api/works/:workId 与 POST /api/works/:workId/delete — 删除作品（POST 兼容部分 CDN/网关拦截 DELETE）
  async function handleDeleteWork(req: AuthRequest, res: Response) {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;

      if (!works.get(workId)) {
        mergeWorksFromDisk();
      }

      const work = works.get(workId);
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      if (String(work.authorId) !== String(userId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      works.delete(workId);
      workMessages.delete(workId);
      WorksPersistence.saveAll(works, workMessages);

      console.log(`🗑️ Work deleted: ${workId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting work:', error);
      res.status(500).json({ error: 'Failed to delete work' });
    }
  }

  router.delete('/:workId', authenticateToken, handleDeleteWork);
  router.post('/:workId/delete', authenticateToken, handleDeleteWork);

  // POST /api/works/:workId/message - 发送消息（创作过程中）
  router.post('/:workId/message', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { workId } = req.params;
    console.log(`📨 [works/message] 收到消息请求 workId=${workId}`);
    try {
      const userId = req.user!.id;
      const { content, videoUrl } = req.body;

      if ((!content || !content.trim()) && !videoUrl?.trim()) {
        return res.status(400).json({ error: 'Message content or video URL is required' });
      }

      const work = works.get(workId);
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      if (work.authorId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (work.status === 'published') {
        return res.status(400).json({ error: 'Cannot edit published work' });
      }

      const message = {
        id: Date.now().toString(),
        workId,
        sender: 'user' as const,
        content: (content || '').trim(),
        videoUrl: videoUrl?.trim() || undefined,
        timestamp: new Date(),
      };

      const messages = workMessages.get(workId) || [];
      messages.push(message);
      workMessages.set(workId, messages);

      work.updatedAt = new Date();
      works.set(workId, work);
      WorksPersistence.saveAll(works, workMessages);

      // Emit user message to socket
      io.to(workId).emit('work-message', message);

      // Forward to Telegram Agent (if configured)
      const agentConfig = workAgentConfigs.get(workId);
      
      console.log(`🔍 Checking agent config for work ${workId}`);
      console.log(`  - Config exists: ${!!agentConfig}`);
      console.log(`  - Agent enabled: ${agentConfig?.agentEnabled}`);
      console.log(`  - Agent status: ${agentConfig?.agentStatus}`);
      console.log(`  - Agent chat ID: ${agentConfig?.agentChatId}`);
      
      if (agentConfig?.agentEnabled && (agentConfig.agentStatus === 'active' || agentConfig.agentStatus === 'connected')) {
        console.log(`🤖 Forwarding message to Telegram Agent for work ${workId}`);
        
        try {
          const result = await mtprotoService.sendAsUser(
            workId,
            agentConfig.agentChatId,
            content.trim()
          );
          if (result.success) {
            console.log(`✅ Message sent to Agent`);
          } else {
            console.error(`❌ Failed to send message:`, result.error);
          }
        } catch (error) {
          console.error(`❌ Failed to send message to Agent:`, error);
        }
      } else {
        console.log(`⚠️ Agent not configured or not active for work ${workId}`);
      }

      console.log(`💬 Message added to work ${workId}`);
      res.json({ message });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // GET /api/works/:workId/messages - 获取作品消息
  router.get('/:workId/messages', async (req: Request, res: Response) => {
    try {
      const { workId } = req.params;
      const work = works.get(workId);

      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      // If published, return saved messages
      if (work.status === 'published') {
        return res.json({ messages: work.messages });
      }

      // If draft, check authorization
      const token = req.headers.authorization?.replace('Bearer ', '');
      console.log(`🔐 Checking messages access for draft work ${workId}`);
      
      if (!token) {
        console.log('  ❌ No token provided');
        return res.status(403).json({ error: 'Access denied' });
      }

      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
        console.log(`  - Decoded user id: ${decoded.userId}, Author id: ${work.authorId}`);
        
        if (decoded.userId !== work.authorId) {
          console.log('  ❌ User is not author');
          return res.status(403).json({ error: 'Access denied' });
        }
        console.log('  ✅ Access granted');
      } catch (error) {
        console.error('  ❌ JWT verify failed:', error);
        return res.status(403).json({ error: 'Access denied' });
      }

      const messages = workMessages.get(workId) || [];
      res.json({ messages });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // GET /api/works/user/:userId - 获取用户的所有作品
  router.get('/user/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { includeDrafts } = req.query;

      mergeWorksFromDisk();
      let userWorks = Array.from(works.values()).filter(
        (work) => String(work.authorId) === String(userId),
      );

      // Check if requester is the author (for drafts)
      if (includeDrafts === 'true') {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
          try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
            if (decoded.userId !== userId) {
              userWorks = userWorks.filter(w => w.status === 'published');
            }
          } catch {
            userWorks = userWorks.filter(w => w.status === 'published');
          }
        } else {
          userWorks = userWorks.filter(w => w.status === 'published');
        }
      } else {
        userWorks = userWorks.filter(w => w.status === 'published');
      }

      const author = userProfiles.get(userId);

      res.json({
        author: author ? {
          id: author.id,
          username: author.username,
          bio: author.bio,
          avatarUrl: author.avatarUrl,
        } : null,
        works: userWorks.map(work => ({
          id: work.id,
          title: work.title,
          description: work.description,
          partition: work.partition || DEFAULT_PARTITION,
          lobsterName: work.lobsterName,
          status: work.status,
          coverImage: work.coverImage,
          tags: work.tags || [],
          viewCount: work.viewCount,
          likeCount: work.likeCount,
          messageCount: work.messages.length,
          createdAt: work.createdAt,
          publishedAt: work.publishedAt,
          updatedAt: work.updatedAt,
        })),
        stats: {
          totalWorks: userWorks.filter(w => w.status === 'published').length,
          totalViews: userWorks.reduce((sum, w) => sum + w.viewCount, 0),
          totalLikes: userWorks.reduce((sum, w) => sum + w.likeCount, 0),
        },
      });
    } catch (error) {
      console.error('Error fetching user works:', error);
      res.status(500).json({ error: 'Failed to fetch user works' });
    }
  });

  return router;
}
