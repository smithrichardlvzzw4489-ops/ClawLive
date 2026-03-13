import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { works, workMessages, userProfiles } from './rooms-simple';
import { mtprotoService } from '../../services/telegram-mtproto';
import { workAgentConfigs } from './work-agent-config';

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

  // PUT /api/works/:workId - 更新作品信息
  router.put('/:workId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { workId } = req.params;
      const userId = req.user!.id;
      const { title, description, tags, coverImage } = req.body;

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
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
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
        content: content.trim(),
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
