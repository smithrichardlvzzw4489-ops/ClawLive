import { Router, Request, Response } from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest, getUserIdFromBearer } from '../middleware/auth';
import { getHostInfo, getHostInfoBatch } from './rooms-simple';
import { addFeedPostComment, getFeedPostComments } from '../../services/feed-post-comments-store';
import { UPLOADS_DIR } from '../../lib/data-path';
import { FeedPostRecord } from '../../services/feed-posts-persistence';
import { getFeedPostsMap, mergeFeedPostsFromDisk, saveFeedPosts } from '../../services/feed-posts-store';
import {
  getReactions,
  removeReactionsForPost,
  toggleFavorite,
  toggleLike,
} from '../../services/feed-post-reactions-store';

const MAX_IMAGES = 9;
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024;

function parseDataUrl(dataUrl: string): { buf: Buffer; ext: string } | null {
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
  if (buf.length === 0 || buf.length > MAX_BYTES_PER_IMAGE) return null;
  return { buf, ext };
}

export function feedPostsRoutes(): Router {
  const router = Router();
  const feedPostsMap = getFeedPostsMap();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const list = Array.from(feedPostsMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const authorIds = [...new Set(list.map((p) => p.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);
      const items = list.map((p) => {
        const author = authorMap.get(p.authorId);
        return {
          id: p.id,
          title: p.title,
          content: p.content,
          imageUrls: p.imageUrls,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          favoriteCount: p.favoriteCount ?? 0,
          commentCount: p.commentCount,
          createdAt: p.createdAt,
          author: author
            ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
            : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });
      res.json({ posts: items });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list posts' });
    }
  });

  /** 当前用户发布的图文（须在 /:id 之前注册） */
  router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      mergeFeedPostsFromDisk();
      const list = Array.from(feedPostsMap.values())
        .filter((p) => String(p.authorId) === String(userId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const items = list.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        imageUrls: p.imageUrls,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
      }));
      res.json({ posts: items });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list posts' });
    }
  });

  /** 发作品正文内插图：先上传得到 /uploads/... 再写入 Markdown（须在 /:id 之前注册，避免误匹配） */
  router.post('/inline-image', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { image } = req.body as { image?: string };
      if (typeof image !== 'string' || !image.startsWith('data:')) {
        return res.status(400).json({ error: '请提供图片 data URL' });
      }
      const parsed = parseDataUrl(image);
      if (!parsed) {
        return res.status(400).json({ error: '图片格式无效或单张不超过 5MB' });
      }
      const dir = join(UPLOADS_DIR, 'feed-posts', 'inline');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const name = `${uuidv4()}.${parsed.ext}`;
      const rel = `/uploads/feed-posts/inline/${name}`;
      writeFileSync(join(dir, name), parsed.buf);
      res.json({ url: rel });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: '上传失败' });
    }
  });

  router.get('/:id/comments', async (req: Request, res: Response) => {
    try {
      const postId = req.params.id;
      const p = feedPostsMap.get(postId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const list = getFeedPostComments(postId);
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

  router.post('/:id/comments', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const postId = req.params.id;
      const p = feedPostsMap.get(postId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!content.trim()) {
        return res.status(400).json({ error: 'content required' });
      }
      const userId = req.user!.id;
      const c = addFeedPostComment(postId, userId, content);
      p.commentCount = (p.commentCount || 0) + 1;
      feedPostsMap.set(p.id, p);
      saveFeedPosts();
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
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'message' in e && (e as { message: string }).message === 'empty') {
        return res.status(400).json({ error: 'content required' });
      }
      console.error(e);
      res.status(500).json({ error: 'Failed to post comment' });
    }
  });

  router.post('/:id/like', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const postId = req.params.id;
      const p = feedPostsMap.get(postId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const userId = req.user!.id;
      const { liked } = toggleLike(postId, userId, p);
      feedPostsMap.set(p.id, p);
      saveFeedPosts();
      res.json({ liked, likeCount: p.likeCount });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  });

  router.post('/:id/favorite', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const postId = req.params.id;
      const p = feedPostsMap.get(postId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const userId = req.user!.id;
      const { favorited } = toggleFavorite(postId, userId, p);
      feedPostsMap.set(p.id, p);
      saveFeedPosts();
      res.json({ favorited, favoriteCount: p.favoriteCount ?? 0 });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to toggle favorite' });
    }
  });

  async function handleDeleteFeedPost(req: AuthRequest, res: Response) {
    try {
      const postId = req.params.id;
      if (!feedPostsMap.get(postId)) {
        mergeFeedPostsFromDisk();
      }
      const p = feedPostsMap.get(postId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      if (String(p.authorId) !== String(req.user!.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      feedPostsMap.delete(postId);
      removeReactionsForPost(postId);
      saveFeedPosts();
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to delete' });
    }
  }

  router.delete('/:id', authenticateToken, handleDeleteFeedPost);
  router.post('/:id/delete', authenticateToken, handleDeleteFeedPost);

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const p = feedPostsMap.get(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });
      p.viewCount += 1;
      feedPostsMap.set(p.id, p);
      saveFeedPosts();

      const uid = getUserIdFromBearer(req);
      const reactions = getReactions(p.id);
      const likedByMe = uid ? reactions.likes.includes(uid) : false;
      const favoritedByMe = uid ? reactions.favorites.includes(uid) : false;

      const authorMap = await getHostInfoBatch([p.authorId]);
      const author = authorMap.get(p.authorId);
      res.json({
        id: p.id,
        title: p.title,
        content: p.content,
        imageUrls: p.imageUrls,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        favoriteCount: p.favoriteCount ?? 0,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        likedByMe,
        favoritedByMe,
        author: author
          ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
          : { id: p.authorId, username: 'Unknown', avatarUrl: null },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load post' });
    }
  });

  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title, content, images } = req.body as {
        title?: string;
        content?: string;
        images?: string[];
      };

      const t = typeof title === 'string' ? title.trim() : '';
      const c = typeof content === 'string' ? content.trim() : '';
      if (!t || t.length > 120) return res.status(400).json({ error: '标题必填且不超过120字' });
      if (!c || c.length > 20000) return res.status(400).json({ error: '正文必填且不超过20000字' });
      const imgs = Array.isArray(images) ? images : [];
      if (imgs.length === 0) return res.status(400).json({ error: '请上传封面图片' });
      if (imgs.length > MAX_IMAGES) return res.status(400).json({ error: `最多${MAX_IMAGES}张图` });

      const id = uuidv4();
      const uploadDir = join(UPLOADS_DIR, 'feed-posts', id);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

      const imageUrls: string[] = [];
      for (let i = 0; i < imgs.length; i++) {
        const raw = imgs[i];
        if (typeof raw !== 'string') continue;
        const parsed = parseDataUrl(raw);
        if (!parsed) return res.status(400).json({ error: `第${i + 1}张图片格式无效或过大` });
        const name = `${uuidv4()}.${parsed.ext}`;
        writeFileSync(join(uploadDir, name), parsed.buf);
        imageUrls.push(`/uploads/feed-posts/${id}/${name}`);
      }
      if (imageUrls.length === 0) {
        return res.status(400).json({ error: '请上传封面图片' });
      }

      const record: FeedPostRecord = {
        id,
        authorId: userId,
        title: t,
        content: c,
        imageUrls,
        viewCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      };
      feedPostsMap.set(id, record);
      saveFeedPosts();
      res.status(201).json(record);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: '发布失败' });
    }
  });

  return router;
}
