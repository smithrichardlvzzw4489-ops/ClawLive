/**
 * 社区 API：帖子、评论、资讯、侧边栏推荐
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  CommunityPersistence,
  CommunityPost,
  CommunityComment,
  CommunityNews,
  PostType,
} from '../../services/community-persistence';
import { getHostInfo, getHostInfoBatch } from './rooms-simple';
import { getRecommendedSkills } from '../../services/recommendation';
import { getAllRooms } from '../../lib/rooms-store';
import { works } from './rooms-simple';

const posts = CommunityPersistence.loadPosts();
const commentsMap = CommunityPersistence.loadComments();

function saveAll(): void {
  CommunityPersistence.savePosts(posts);
  CommunityPersistence.saveComments(commentsMap);
}

// 确保评论 map 中每个 post 都有数组
function getCommentsForPost(postId: string): CommunityComment[] {
  let arr = commentsMap.get(postId);
  if (!arr) {
    arr = [];
    commentsMap.set(postId, arr);
  }
  return arr;
}

export function communityRoutes(): Router {
  const router = Router();

  // GET /api/community/posts - 列表，支持 type、tag、sort
  router.get('/posts', async (req: Request, res: Response) => {
    try {
      const { type, tag, sort = 'latest', limit = '20' } = req.query;
      let list = Array.from(posts.values());

      if (type && typeof type === 'string' && ['question', 'discussion', 'experience', 'retrospective'].includes(type)) {
        list = list.filter((p) => p.type === type);
      }
      if (tag && typeof tag === 'string' && tag.trim()) {
        const t = tag.trim().toLowerCase();
        list = list.filter((p) => p.tags.some((x) => x.toLowerCase() === t));
      }

      if (sort === 'hot') {
        list.sort((a, b) => {
          const scoreA = a.likeCount + a.commentCount * 2 + Math.log1p(a.viewCount);
          const scoreB = b.likeCount + b.commentCount * 2 + Math.log1p(b.viewCount);
          return scoreB - scoreA;
        });
      } else {
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      const take = Math.min(100, parseInt(String(limit), 10) || 20);
      const sliced = list.slice(0, take);
      const authorIds = [...new Set(sliced.map((p) => p.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);

      const result = sliced.map((p) => {
        const author = authorMap.get(p.authorId);
        return {
          ...p,
          author: author
            ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
            : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });

      res.json({ posts: result, total: list.length });
    } catch (error) {
      console.error('Community posts list error:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });

  // POST /api/community/posts - 发帖
  router.post('/posts', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { type, title, content, tags, skillId } = req.body;

      if (!type || !title || !content) {
        return res.status(400).json({ error: 'type, title, content required' });
      }
      const validTypes: PostType[] = ['question', 'discussion', 'experience', 'retrospective'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'type must be question|discussion|experience|retrospective' });
      }

      const id = `post-${Date.now()}-${uuidv4().slice(0, 6)}`;
      const now = new Date();
      const post: CommunityPost = {
        id,
        authorId: userId,
        type,
        title: String(title).trim(),
        content: String(content).trim(),
        tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string').slice(0, 10) : [],
        likeCount: 0,
        commentCount: 0,
        viewCount: 0,
        solved: type === 'question' ? false : undefined,
        skillId: skillId && typeof skillId === 'string' ? skillId : undefined,
        createdAt: now,
        updatedAt: now,
      };

      posts.set(id, post);
      commentsMap.set(id, []);
      saveAll();

      const author = await getHostInfo(userId);
      res.status(201).json({
        ...post,
        author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl },
      });
    } catch (error) {
      console.error('Community post create error:', error);
      res.status(500).json({ error: 'Failed to create post' });
    }
  });

  // GET /api/community/posts/:postId/related - 相关帖子（同标签或同类型）
  router.get('/posts/:postId/related', async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const post = posts.get(postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      const limit = Math.min(10, parseInt(String(req.query.limit || 5), 10) || 5);
      const allPosts = Array.from(posts.values()).filter((p) => p.id !== postId);
      const postTags = post.tags.map((t) => t.toLowerCase());
      const scored = allPosts.map((p) => {
        let score = 0;
        if (p.type === post.type) score += 3;
        const sharedTags = (p.tags || []).filter((t) => postTags.includes(t.toLowerCase())).length;
        score += sharedTags * 2;
        return { post: p, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const top = scored.filter((x) => x.score > 0).slice(0, limit).map((x) => x.post);
      if (top.length === 0) {
        const byType = allPosts.filter((p) => p.type === post.type).slice(0, limit);
        const byDate = allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
        const result = byType.length >= byDate.length ? byType : byDate;
        const authorIds = [...new Set(result.map((p) => p.authorId))];
        const authorMap = await getHostInfoBatch(authorIds);
        const withAuthor = result.map((p) => {
          const a = authorMap.get(p.authorId);
          return { ...p, author: a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: p.authorId, username: 'Unknown', avatarUrl: null } };
        });
        return res.json({ posts: withAuthor });
      }
      const authorIds = [...new Set(top.map((p) => p.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);
      const withAuthor = top.map((p) => {
        const a = authorMap.get(p.authorId);
        return { ...p, author: a ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl } : { id: p.authorId, username: 'Unknown', avatarUrl: null } };
      });
      res.json({ posts: withAuthor });
    } catch (error) {
      console.error('Community related posts error:', error);
      res.status(500).json({ error: 'Failed to fetch related posts' });
    }
  });

  // GET /api/community/posts/:postId - 详情（含评论）
  router.get('/posts/:postId', async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const post = posts.get(postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      post.viewCount++;
      posts.set(postId, post);
      saveAll();

      const author = await getHostInfo(post.authorId);
      const commentList = getCommentsForPost(postId);
      const commentAuthorIds = [...new Set(commentList.map((c) => c.authorId))];
      const commentAuthorMap = await getHostInfoBatch(commentAuthorIds);

      const commentsWithAuthor = commentList
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((c) => {
          const a = commentAuthorMap.get(c.authorId);
          return {
            ...c,
            author: a
              ? { id: a.id, username: a.username, avatarUrl: a.avatarUrl }
              : { id: c.authorId, username: 'Unknown', avatarUrl: null },
          };
        });

      res.json({
        ...post,
        author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl },
        comments: commentsWithAuthor,
      });
    } catch (error) {
      console.error('Community post detail error:', error);
      res.status(500).json({ error: 'Failed to fetch post' });
    }
  });

  // POST /api/community/posts/:postId/comments - 评论/回答
  router.post('/posts/:postId/comments', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.id;
      const { content } = req.body;

      const post = posts.get(postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'content required' });
      }

      const commentId = `comment-${Date.now()}-${uuidv4().slice(0, 6)}`;
      const now = new Date();
      const comment: CommunityComment = {
        id: commentId,
        postId,
        authorId: userId,
        content: content.trim(),
        likeCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const commentList = getCommentsForPost(postId);
      commentList.push(comment);
      commentsMap.set(postId, commentList);

      post.commentCount++;
      post.updatedAt = now;
      posts.set(postId, post);
      saveAll();

      const author = await getHostInfo(userId);
      res.status(201).json({
        ...comment,
        author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl },
      });
    } catch (error) {
      console.error('Community comment create error:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  });

  // PATCH /api/community/posts/:postId/solved - 标记问题已解决
  router.patch('/posts/:postId/solved', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.id;
      const post = posts.get(postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.authorId !== userId) return res.status(403).json({ error: 'Not authorized' });
      if (post.type !== 'question') return res.status(400).json({ error: 'Only questions can be marked solved' });

      post.solved = true;
      post.updatedAt = new Date();
      posts.set(postId, post);
      saveAll();
      res.json(post);
    } catch (error) {
      console.error('Community post solved error:', error);
      res.status(500).json({ error: 'Failed to update' });
    }
  });

  // GET /api/community/news - AI 资讯列表
  router.get('/news', async (_req: Request, res: Response) => {
    try {
      const news = CommunityPersistence.loadNews();
      res.json({ news });
    } catch (error) {
      console.error('Community news error:', error);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });

  // GET /api/community/my-updates - 我的更新（登录用户）
  router.get('/my-updates', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const myPosts = Array.from(posts.values())
        .filter((p) => p.authorId === userId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          commentCount: p.commentCount,
          updatedAt: p.updatedAt,
        }));
      res.json({ updates: myPosts });
    } catch (error) {
      console.error('Community my-updates error:', error);
      res.status(500).json({ error: 'Failed to fetch' });
    }
  });

  // GET /api/community/sidebar - 侧边栏数据
  router.get('/sidebar', async (req: Request, res: Response) => {
    try {
      const allPosts = Array.from(posts.values());
      const tagCount = new Map<string, number>();
      allPosts.forEach((p) => {
        (p.tags || []).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1));
      });
      const hotTopics = Array.from(tagCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count }));

      const latestQuestions = allPosts
        .filter((p) => p.type === 'question')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((p) => ({ id: p.id, title: p.title, commentCount: p.commentCount, solved: p.solved }));

      const authorPostCount = new Map<string, number>();
      allPosts.forEach((p) => authorPostCount.set(p.authorId, (authorPostCount.get(p.authorId) || 0) + 1));
      const hotAuthorIds = Array.from(authorPostCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);
      const hotCreatorsMap = await getHostInfoBatch(hotAuthorIds);
      const hotCreators = hotAuthorIds.map((id) => {
        const author = hotCreatorsMap.get(id);
        const count = authorPostCount.get(id) || 0;
        return author
          ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl, postCount: count }
          : { id, username: 'Unknown', avatarUrl: null, postCount: count };
      });

      const recommendedSkills = await getRecommendedSkills();

      const allRooms = await getAllRooms();
      const liveHostIds = [...new Set(allRooms.filter((r) => r.isLive).map((r) => r.hostId))];
      const workAuthorIds = [...new Set(Array.from(works.values()).filter((w) => w.status === 'published').map((w) => w.authorId))];
      const creatorIds = [...new Set([...liveHostIds, ...workAuthorIds])].slice(0, 6);
      const creatorMap = await getHostInfoBatch(creatorIds);
      const creators = creatorIds.map((id) => creatorMap.get(id)).filter(Boolean) as Array<{
        id: string;
        username: string;
        avatarUrl?: string | null;
      }>;

      res.json({
        hotTopics,
        latestQuestions,
        hotCreators,
        recommendedSkills,
        creators: creators.map((c) => ({ id: c.id, username: c.username, avatarUrl: c.avatarUrl })),
      });
    } catch (error) {
      console.error('Community sidebar error:', error);
      res.status(500).json({ error: 'Failed to fetch sidebar' });
    }
  });

  return router;
}
