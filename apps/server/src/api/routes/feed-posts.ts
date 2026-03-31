import { Router, Request, Response } from 'express';
import { mkdirSync, existsSync } from 'fs';
import { writeFile as writeFileAsync } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest, getUserIdFromBearer } from '../middleware/auth';
import { getHostInfo, getHostInfoBatch } from './rooms-simple';
import { addFeedPostComment, getFeedPostComments } from '../../services/feed-post-comments-store';
import { UPLOADS_DIR } from '../../lib/data-path';
import { FeedPostRecord } from '../../services/feed-posts-persistence';
import { getFeedPostsMap, mergeFeedPostsFromDatabase, saveFeedPosts } from '../../services/feed-posts-store';
import {
  getReactions,
  removeReactionsForPost,
  toggleFavorite,
  toggleLike,
} from '../../services/feed-post-reactions-store';
import { recordBehavior } from '../../services/user-behavior';
import { prisma } from '../../lib/prisma';

const MAX_IMAGES = 9;
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024;
const FEED_IMAGE_TEXT_MAX = 1000;
const FEED_IMAGE_TEXT_MAX_TITLE = 20;

function isPlainTextNoEmbeddedImages(content: string): boolean {
  if (/\!\[/.test(content)) return false;
  if (/<\s*img\b/i.test(content)) return false;
  return true;
}

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

  router.get('/', async (req: Request, res: Response) => {
    try {
      await mergeFeedPostsFromDatabase();
      const { offset, limit, evolutionPointId } = req.query;
      let list = Array.from(feedPostsMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const evo = typeof evolutionPointId === 'string' && evolutionPointId.trim() ? evolutionPointId.trim() : '';
      if (evo) {
        list = list.filter((p) => (p as FeedPostRecord & { evolutionPointId?: string }).evolutionPointId === evo);
      }
      const total = list.length;
      const offsetNum = Math.max(0, parseInt(offset as string) || 0);
      const limitNum = Math.min(Math.max(1, parseInt(limit as string) || 100), 100);
      const page = list.slice(offsetNum, offsetNum + limitNum);
      const authorIds = [...new Set(page.map((p) => p.authorId))];
      const authorMap = await getHostInfoBatch(authorIds);
      const items = page.map((p) => {
        const author = authorMap.get(p.authorId);
        return {
          id: p.id,
          kind: p.kind ?? 'article',
          title: p.title,
          content: p.content,
          imageUrls: p.imageUrls,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          favoriteCount: p.favoriteCount ?? 0,
          commentCount: p.commentCount,
          createdAt: p.createdAt,
          publishedByAgent: p.publishedByAgent ?? false,
          author: author
            ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl }
            : { id: p.authorId, username: 'Unknown', avatarUrl: null },
        };
      });
      res.json({ posts: items, total });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to list posts' });
    }
  });

  /** 当前用户发布的图文（须在 /:id 之前注册） */
  router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      await mergeFeedPostsFromDatabase();
      const list = Array.from(feedPostsMap.values())
        .filter((p) => String(p.authorId) === String(userId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const items = list.map((p) => ({
        id: p.id,
        kind: p.kind ?? 'article',
        title: p.title,
        content: p.content,
        imageUrls: p.imageUrls,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        publishedByAgent: p.publishedByAgent ?? false,
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
      await writeFileAsync(join(dir, name), parsed.buf);
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
      const list = await getFeedPostComments(postId);
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
      const c = await addFeedPostComment(postId, userId, content);
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
      if (liked) {
        recordBehavior({ userId, type: 'feed_post_like', targetId: postId, authorId: p.authorId });
        // 点赞奖励作者 +1 积分（不奖励自己点赞）
        if (p.authorId && p.authorId !== userId) {
          prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
              where: { id: p.authorId },
              data: { clawPoints: { increment: 1 } },
              select: { clawPoints: true },
            });
            await tx.pointLedger.create({
              data: {
                userId: p.authorId,
                delta: 1,
                balanceAfter: updated.clawPoints,
                reason: 'post_liked',
                metadata: { postId, likedBy: userId },
              },
            });
          }).catch((e: unknown) => console.error('[feed] like reward error:', e));
        }
      }
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
      if (favorited) {
        recordBehavior({ userId, type: 'feed_post_collect', targetId: postId, authorId: p.authorId });
        // 收藏奖励作者 +2 积分（不奖励自己收藏）
        if (p.authorId && p.authorId !== userId) {
          prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
              where: { id: p.authorId },
              data: { clawPoints: { increment: 2 } },
              select: { clawPoints: true },
            });
            await tx.pointLedger.create({
              data: {
                userId: p.authorId,
                delta: 2,
                balanceAfter: updated.clawPoints,
                reason: 'post_favorited',
                metadata: { postId, favoritedBy: userId },
              },
            });
          }).catch((e: unknown) => console.error('[feed] favorite reward error:', e));
        }
      }
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
        await mergeFeedPostsFromDatabase();
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

      // 记录浏览行为，用于个性化推荐
      const viewerId = getUserIdFromBearer(req);
      if (viewerId && viewerId !== p.authorId) {
        recordBehavior({ userId: viewerId, type: 'feed_post_view', targetId: p.id, authorId: p.authorId });
      }

      const uid = getUserIdFromBearer(req);
      const reactions = getReactions(p.id);
      const likedByMe = uid ? reactions.likes.includes(uid) : false;
      const favoritedByMe = uid ? reactions.favorites.includes(uid) : false;

      const authorMap = await getHostInfoBatch([p.authorId]);
      const author = authorMap.get(p.authorId);
      res.json({
        id: p.id,
        kind: p.kind ?? 'article',
        title: p.title,
        content: p.content,
        imageUrls: p.imageUrls,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        favoriteCount: p.favoriteCount ?? 0,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        publishedByAgent: p.publishedByAgent ?? false,
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

  // ── 编辑帖子（仅作者）─────────────────────────────────────────────────────
  router.patch('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const post = feedPostsMap.get(id);
      if (!post) return res.status(404).json({ error: '帖子不存在' });
      if (String(post.authorId) !== String(userId)) return res.status(403).json({ error: '无权编辑' });

      const { title, content, images, coverIdx } = req.body as {
        title?: string;
        content?: string;
        images?: string[];
        coverIdx?: number;
      };

      const t = typeof title === 'string' ? title.trim() : post.title;
      const c = typeof content === 'string' ? content.trim() : post.content;
      const kind = post.kind ?? 'article';
      const maxTitleLen = kind === 'imageText' ? FEED_IMAGE_TEXT_MAX_TITLE : 120;
      if (!t || t.length > maxTitleLen) {
        return res.status(400).json({ error: `标题必填且不超过${maxTitleLen}字` });
      }

      if (kind === 'imageText') {
        if (!c || c.length > FEED_IMAGE_TEXT_MAX) {
          return res.status(400).json({ error: `正文必填且不超过${FEED_IMAGE_TEXT_MAX}字` });
        }
        if (!isPlainTextNoEmbeddedImages(c)) {
          return res.status(400).json({ error: '正文不可插入图片' });
        }
      } else {
        if (!c || c.length > 20000) return res.status(400).json({ error: '正文必填且不超过20000字' });
      }

      // 处理图片：已有 URL 保留，新 base64 上传
      let newImageUrls = post.imageUrls;
      if (Array.isArray(images) && images.length > 0) {
        if (images.length > MAX_IMAGES) return res.status(400).json({ error: `最多${MAX_IMAGES}张图片` });
        const uploadDir = join(UPLOADS_DIR, 'feed-posts', id);
        if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

        const resolvedEntries: { idx: number; url: string; buf?: Buffer; path?: string }[] = [];
        for (let i = 0; i < images.length; i++) {
          const raw = images[i];
          if (typeof raw !== 'string') continue;
          if (raw.startsWith('/uploads/')) {
            resolvedEntries.push({ idx: i, url: raw });
          } else {
            const parsed = parseDataUrl(raw);
            if (!parsed) return res.status(400).json({ error: `第${i + 1}张图片格式无效或过大` });
            const name = `${uuidv4()}.${parsed.ext}`;
            const filePath = join(uploadDir, name);
            resolvedEntries.push({ idx: i, url: `/uploads/feed-posts/${id}/${name}`, buf: parsed.buf, path: filePath });
          }
        }
        await Promise.all(
          resolvedEntries.filter((e) => e.buf && e.path).map((e) => writeFileAsync(e.path!, e.buf!)),
        );
        const resolved = resolvedEntries.map((e) => e.url);

        // 图文：把用户选的封面排到第一位
        if (kind === 'imageText' && typeof coverIdx === 'number' && coverIdx >= 0 && coverIdx < resolved.length) {
          const cover = resolved.splice(coverIdx, 1)[0];
          resolved.unshift(cover);
        }

        if (resolved.length === 0) return res.status(400).json({ error: '请上传封面图片' });
        if (kind === 'article' && resolved.length === 0) return res.status(400).json({ error: '请上传封面图片' });
        newImageUrls = resolved;
      }

      post.title = t;
      post.content = c;
      post.imageUrls = newImageUrls;
      post.updatedAt = new Date().toISOString();
      feedPostsMap.set(id, post);
      saveFeedPosts();
      return res.json(post);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: '更新失败' });
    }
  });

  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title, content, images, kind: kindRaw } = req.body as {
        title?: string;
        content?: string;
        images?: string[];
        kind?: string;
      };

      const kind: 'article' | 'imageText' = kindRaw === 'imageText' ? 'imageText' : 'article';

      const t = typeof title === 'string' ? title.trim() : '';
      const c = typeof content === 'string' ? content.trim() : '';
      const maxTitleLen = kind === 'imageText' ? FEED_IMAGE_TEXT_MAX_TITLE : 120;
      if (!t || t.length > maxTitleLen) {
        return res.status(400).json({ error: `标题必填且不超过${maxTitleLen}字` });
      }

      const imgs = Array.isArray(images) ? images : [];

      if (kind === 'imageText') {
        if (!c || c.length > FEED_IMAGE_TEXT_MAX) {
          return res.status(400).json({ error: `正文必填且不超过${FEED_IMAGE_TEXT_MAX}字` });
        }
        if (!isPlainTextNoEmbeddedImages(c)) {
          return res.status(400).json({ error: '正文不可插入图片' });
        }
        if (imgs.length < 1 || imgs.length > MAX_IMAGES) {
          return res.status(400).json({ error: `请上传1～${MAX_IMAGES}张图片` });
        }
      } else {
        if (!c || c.length > 20000) return res.status(400).json({ error: '正文必填且不超过20000字' });
        if (imgs.length === 0) return res.status(400).json({ error: '请上传封面图片' });
        if (imgs.length > MAX_IMAGES) return res.status(400).json({ error: `最多${MAX_IMAGES}张图` });
      }

      const id = uuidv4();
      const uploadDir = join(UPLOADS_DIR, 'feed-posts', id);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

      const imageEntries: { url: string; buf: Buffer; path: string }[] = [];
      for (let i = 0; i < imgs.length; i++) {
        const raw = imgs[i];
        if (typeof raw !== 'string') continue;
        const parsed = parseDataUrl(raw);
        if (!parsed) return res.status(400).json({ error: `第${i + 1}张图片格式无效或过大` });
        const name = `${uuidv4()}.${parsed.ext}`;
        imageEntries.push({ url: `/uploads/feed-posts/${id}/${name}`, buf: parsed.buf, path: join(uploadDir, name) });
      }
      if (imageEntries.length === 0) {
        return res.status(400).json({ error: '请上传封面图片' });
      }
      await Promise.all(imageEntries.map((e) => writeFileAsync(e.path, e.buf)));
      const imageUrls = imageEntries.map((e) => e.url);

      const record: FeedPostRecord = {
        id,
        authorId: userId,
        kind,
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
