import { prisma } from '../lib/prisma';
import type { FeedPostRecord } from './feed-posts-persistence';

type Reactions = { likes: string[]; favorites: string[] };

const byPost = new Map<string, Reactions>();

/** 管理员清空 Feed 时同步清空内存中的点赞/收藏索引 */
export function clearReactionsInMemory(): void {
  byPost.clear();
}

export async function bootstrapFeedReactionsFromPostgres(): Promise<void> {
  byPost.clear();
  const rows = await prisma.feedPostReaction.findMany();
  for (const r of rows) {
    let rec = byPost.get(r.postId);
    if (!rec) {
      rec = { likes: [], favorites: [] };
      byPost.set(r.postId, rec);
    }
    if (r.kind === 'like') {
      if (!rec.likes.includes(r.userId)) rec.likes.push(r.userId);
    } else if (r.kind === 'favorite') {
      if (!rec.favorites.includes(r.userId)) rec.favorites.push(r.userId);
    }
  }
  console.log(`[Feed] Loaded ${rows.length} reaction row(s) from PostgreSQL`);
}

export function getReactions(postId: string): Reactions {
  return byPost.get(postId) || { likes: [], favorites: [] };
}

export function toggleLike(postId: string, userId: string, p: FeedPostRecord): { liked: boolean } {
  let r = byPost.get(postId);
  if (!r) {
    r = { likes: [], favorites: [] };
    byPost.set(postId, r);
  }
  const i = r.likes.indexOf(userId);
  if (i >= 0) {
    r.likes.splice(i, 1);
    p.likeCount = Math.max(0, (p.likeCount ?? 0) - 1);
    void prisma.feedPostReaction
      .delete({
        where: {
          postId_userId_kind: { postId, userId, kind: 'like' },
        },
      })
      .catch((e) => console.error('[Feed] unlike:', e));
  } else {
    r.likes.push(userId);
    p.likeCount = (p.likeCount ?? 0) + 1;
    void prisma.feedPostReaction
      .create({
        data: { postId, userId, kind: 'like' },
      })
      .catch((e) => console.error('[Feed] like:', e));
  }
  return { liked: i < 0 };
}

export function removeReactionsForPost(postId: string): void {
  byPost.delete(postId);
  void prisma.feedPostReaction.deleteMany({ where: { postId } }).catch((e) => {
    console.error('[Feed] remove reactions:', e);
  });
}

export function toggleFavorite(postId: string, userId: string, p: FeedPostRecord): { favorited: boolean } {
  let r = byPost.get(postId);
  if (!r) {
    r = { likes: [], favorites: [] };
    byPost.set(postId, r);
  }
  const i = r.favorites.indexOf(userId);
  if (i >= 0) {
    r.favorites.splice(i, 1);
    p.favoriteCount = Math.max(0, (p.favoriteCount ?? 0) - 1);
    void prisma.feedPostReaction
      .delete({
        where: {
          postId_userId_kind: { postId, userId, kind: 'favorite' },
        },
      })
      .catch((e) => console.error('[Feed] unfavorite:', e));
  } else {
    r.favorites.push(userId);
    p.favoriteCount = (p.favoriteCount ?? 0) + 1;
    void prisma.feedPostReaction
      .create({
        data: { postId, userId, kind: 'favorite' },
      })
      .catch((e) => console.error('[Feed] favorite:', e));
  }
  return { favorited: i < 0 };
}
