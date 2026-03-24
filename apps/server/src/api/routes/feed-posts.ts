import { Router, Request, Response } from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getHostInfoBatch } from './rooms-simple';
import { UPLOADS_DIR } from '../../lib/data-path';
import { FeedPostRecord } from '../../services/feed-posts-persistence';
import { getFeedPostsMap, saveFeedPosts } from '../../services/feed-posts-store';

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

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const p = feedPostsMap.get(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });
      p.viewCount += 1;
      feedPostsMap.set(p.id, p);
      saveFeedPosts();

      const authorMap = await getHostInfoBatch([p.authorId]);
      const author = authorMap.get(p.authorId);
      res.json({
        id: p.id,
        title: p.title,
        content: p.content,
        imageUrls: p.imageUrls,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
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

      const record: FeedPostRecord = {
        id,
        authorId: userId,
        title: t,
        content: c,
        imageUrls,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      };
      feedPostsMap.set(id, record);
      saveFeedPosts();
      res.status(201).json({ id, ...record });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: '发布失败' });
    }
  });

  return router;
}
