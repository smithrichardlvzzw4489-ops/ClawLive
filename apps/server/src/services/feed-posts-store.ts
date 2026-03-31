import { existsSync, readFileSync } from 'fs';
import type { FeedPost as FeedPostRow } from '@prisma/client';
import { getDataFilePath } from '../lib/data-path';
import { prisma } from '../lib/prisma';
import type { FeedPostRecord } from './feed-posts-persistence';
import { clearReactionsInMemory } from './feed-post-reactions-store';

const feedPostsMap = new Map<string, FeedPostRecord>();

function rowToRecord(r: FeedPostRow): FeedPostRecord {
  const urls = r.imageUrls;
  const imageUrls = Array.isArray(urls) ? (urls as unknown[]).map((x) => String(x)) : [];
  return {
    id: r.id,
    authorId: r.authorId,
    kind: (r.kind as FeedPostRecord['kind']) ?? undefined,
    title: r.title,
    content: r.content,
    imageUrls,
    viewCount: r.viewCount,
    likeCount: r.likeCount,
    favoriteCount: r.favoriteCount,
    commentCount: r.commentCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt?.toISOString(),
    publishedByAgent: r.publishedByAgent,
    excerpt: r.excerpt ?? undefined,
    evolutionPointId: r.evolutionPointId ?? undefined,
  };
}

function recordToPrismaData(p: FeedPostRecord) {
  return {
    authorId: p.authorId,
    kind: p.kind ?? null,
    title: p.title,
    content: p.content,
    imageUrls: p.imageUrls,
    viewCount: p.viewCount,
    likeCount: p.likeCount,
    favoriteCount: p.favoriteCount ?? 0,
    commentCount: p.commentCount,
    createdAt: new Date(p.createdAt),
    updatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
    publishedByAgent: p.publishedByAgent ?? false,
    excerpt: p.excerpt ?? null,
    evolutionPointId: p.evolutionPointId ?? null,
  };
}

export async function bootstrapFeedPostsFromPostgres(): Promise<void> {
  const rows = await prisma.feedPost.findMany();
  feedPostsMap.clear();
  for (const r of rows) {
    feedPostsMap.set(r.id, rowToRecord(r));
  }
  console.log(`[Feed] Loaded ${feedPostsMap.size} post(s) from PostgreSQL`);
}

/** 若表为空，从旧版 feed-posts.json 导入一次 */
export async function importFeedPostsFromLegacyJsonIfEmpty(): Promise<void> {
  const n = await prisma.feedPost.count();
  const path = getDataFilePath('feed-posts.json');
  if (n > 0 || !existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, FeedPostRecord>;
    let nOk = 0;
    for (const [id, p] of Object.entries(raw)) {
      const u = await prisma.user.findUnique({ where: { id: p.authorId } });
      if (!u) continue;
      const fid = p.id || id;
      const merged = { ...p, id: fid };
      await prisma.feedPost.upsert({
        where: { id: fid },
        create: {
          id: fid,
          ...recordToPrismaData(merged),
        },
        update: recordToPrismaData(merged),
      });
      nOk++;
    }
    if (nOk > 0) console.log(`[Bootstrap] Imported ${nOk} feed post(s) from legacy JSON`);
  } catch (e) {
    console.error('[Bootstrap] legacy feed-posts import:', e);
  }
}

/** 多实例：从数据库再合并当前进程缺的条目 */
export async function mergeFeedPostsFromDatabase(): Promise<void> {
  const rows = await prisma.feedPost.findMany();
  for (const r of rows) {
    if (!feedPostsMap.has(r.id)) {
      feedPostsMap.set(r.id, rowToRecord(r));
    }
  }
}

export function getFeedPostsMap(): Map<string, FeedPostRecord> {
  return feedPostsMap;
}

export function saveFeedPosts(): void {
  void persistAllFeedPosts();
}

/** 管理员：清空内存与数据库中的 Feed 及评论、反应 */
export async function clearAllFeedPostsAndRelated(): Promise<number> {
  const n = feedPostsMap.size;
  feedPostsMap.clear();
  clearReactionsInMemory();
  await prisma.$transaction([
    prisma.feedPostComment.deleteMany(),
    prisma.feedPostReaction.deleteMany(),
    prisma.feedPost.deleteMany(),
  ]);
  return n;
}

async function persistAllFeedPosts(): Promise<void> {
  const entries = Array.from(feedPostsMap.values());
  if (entries.length === 0) return;
  try {
    await prisma.$transaction(
      entries.map((p) =>
        prisma.feedPost.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            ...recordToPrismaData(p),
          },
          update: recordToPrismaData(p),
        }),
      ),
    );
  } catch (e) {
    console.error('[Feed] persist posts:', e);
  }
}

export function getFeedPostsSortedNewest(): FeedPostRecord[] {
  return Array.from(feedPostsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * CES（内容体验分）+ 时间衰减打分
 *
 * CES = 点赞×1 + 收藏×1 + 评论×4
 * 时间衰减：(发布小时数 + 2)^1.3，头2小时衰减极慢
 * 黄金时段：发布后 <2h → ×3，<24h → ×1.5，之后 ×1
 * 保底分：确保 CES=0 的新帖也有基础曝光机会
 */
function scoreFeedPostCES(post: FeedPostRecord): number {
  const ces = (post.likeCount ?? 0) * 1 + (post.favoriteCount ?? 0) * 1 + (post.commentCount ?? 0) * 4;
  const hoursSince = Math.max(
    (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
    0,
  );
  const decay = Math.pow(hoursSince + 2, 1.3);
  const freshBonus = hoursSince < 2 ? 3.0 : hoursSince < 24 ? 1.5 : 1.0;
  return ((ces + 0.5) / decay) * freshBonus;
}

/** 按 CES + 时间衰减排序，返回所有帖子（推荐层再做分页/多样性处理） */
export function getFeedPostsScoredByCES(): Array<{ post: FeedPostRecord; score: number }> {
  return Array.from(feedPostsMap.values())
    .map((p) => ({ post: p, score: scoreFeedPostCES(p) }))
    .sort((a, b) => b.score - a.score);
}
