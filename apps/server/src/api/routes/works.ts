import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { works, workMessages, userProfiles } from './rooms-simple';
import { mtprotoService } from '../../services/telegram-mtproto';
import { workAgentConfigs } from './work-agent-config';
import { recordBehavior } from '../../services/user-behavior';

export function worksRoutes(io: Server): Router {
  const router = Router();
  // Force reload

  // GET /api/works - 获取所有已发布的作品
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { authorId, tag, search } = req.query;
      
      let worksList = Array.from(works.values())
        .filter(work => work.status === 'published')
        .map(work => {
          const author = userProfiles.get(work.authorId);
          return {
            id: work.id,
            title: work.title,
            description: work.description,
            lobsterName: work.lobsterName,
            coverImage: work.coverImage,
            videoUrl: work.videoUrl,
            tags: work.tags || [],
            viewCount: work.viewCount,
            likeCount: work.likeCount,
            messageCount: work.messages.length,
            publishedAt: work.publishedAt,
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

      const author = userProfiles.get(work.authorId);

      res.json({
        ...work,
        author: author ? {
          id: author.id,
          username: author.username,
          avatarUrl: author.avatarUrl,
        } : {
          id: work.authorId,
          username: 'Unknown',
          avatarUrl: null,
        },
      });
    } catch (error) {
      console.error('Error fetching work:', error);
      res.status(500).json({ error: 'Failed to fetch work' });
    }
  });

  // POST /api/works - 创建新作品
  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title, description, lobsterName } = req.body;

      if (!title || !lobsterName) {
        return res.status(400).json({ error: 'Title and lobster name are required' });
      }

      const workId = `work-${Date.now()}`;
      const newWork = {
        id: workId,
        authorId: userId,
        title,
        description: description || '',
        lobsterName,
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

      const uploadDir = join(process.cwd(), 'uploads', 'works', workId);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
      const filename = `${uuidv4()}.${ext}`;
      const filepath = join(uploadDir, filename);
      writeFileSync(filepath, buf);

      const baseUrl = process.env.API_BASE_URL || (req.protocol + '://' + req.get('host'));
      const url = `${baseUrl}/uploads/works/${workId}/${filename}`;
      console.log(`📹 Video uploaded for work ${workId}: ${filename}`);
      res.json({ url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error uploading video:', error);
      res.status(500).json({ error: `视频上传失败: ${msg}` });
    }
  });

  // PUT /api/works/:workId - 更新作品信息
  router.put('/:workId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { title, description, tags, coverImage, videoUrl } = req.body;

      const work = works.get(workId);
      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      if (work.authorId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (title) work.title = title;
      if (description !== undefined) work.description = description;
      if (tags) work.tags = tags;
      if (coverImage !== undefined) work.coverImage = coverImage;
      if (videoUrl !== undefined) work.videoUrl = videoUrl === '' || videoUrl === null ? undefined : videoUrl;
      work.updatedAt = new Date();

      works.set(workId, work);
      res.json(work);
    } catch (error) {
      console.error('Error updating work:', error);
      res.status(500).json({ error: 'Failed to update work' });
    }
  });

  // POST /api/works/:workId/publish - 发布作品
  router.post('/:workId/publish', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { videoUrl } = req.body || {};

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

      // 发布时确保包含视频内容（客户端传入的 videoUrl 优先）
      if (videoUrl !== undefined && videoUrl !== null && videoUrl !== '') {
        work.videoUrl = videoUrl;
      }

      // Save messages to work
      const messages = workMessages.get(workId) || [];
      work.messages = messages;
      work.status = 'published';
      work.publishedAt = new Date();
      work.updatedAt = new Date();

      works.set(workId, work);

      console.log(`📤 Work published: ${workId}`);
      res.json(work);
    } catch (error) {
      console.error('Error publishing work:', error);
      res.status(500).json({ error: 'Failed to publish work' });
    }
  });

  // DELETE /api/works/:workId - 删除作品
  router.delete('/:workId', authenticateToken, async (req: AuthRequest, res: Response) => {
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

      works.delete(workId);
      workMessages.delete(workId);

      console.log(`🗑️ Work deleted: ${workId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting work:', error);
      res.status(500).json({ error: 'Failed to delete work' });
    }
  });

  // POST /api/works/:workId/message - 发送消息（创作过程中）
  router.post('/:workId/message', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
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

      // Emit user message to socket
      io.to(workId).emit('work-message', message);

      // Forward to Telegram Agent (if configured)
      const agentConfig = workAgentConfigs.get(workId);
      
      console.log(`🔍 Checking agent config for work ${workId}`);
      console.log(`  - Config exists: ${!!agentConfig}`);
      console.log(`  - Agent enabled: ${agentConfig?.agentEnabled}`);
      console.log(`  - Agent status: ${agentConfig?.agentStatus}`);
      console.log(`  - Agent chat ID: ${agentConfig?.agentChatId}`);
      
      if (agentConfig?.agentEnabled && agentConfig.agentStatus === 'active') {
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

      let userWorks = Array.from(works.values())
        .filter(work => work.authorId === userId);

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
