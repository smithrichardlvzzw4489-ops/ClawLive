import { FeedPostsPersistence, FeedPostRecord } from './feed-posts-persistence';

const feedPostsMap = new Map<string, FeedPostRecord>();
FeedPostsPersistence.load().forEach((v, k) => feedPostsMap.set(k, v));

/** 合并磁盘数据（多实例时当前进程可能缺条目） */
export function mergeFeedPostsFromDisk(): void {
  FeedPostsPersistence.load().forEach((v, k) => {
    if (!feedPostsMap.has(k)) feedPostsMap.set(k, v);
  });
}

export function getFeedPostsMap(): Map<string, FeedPostRecord> {
  return feedPostsMap;
}

export function saveFeedPosts(): void {
  FeedPostsPersistence.save(feedPostsMap);
}

export function getFeedPostsSortedNewest(): FeedPostRecord[] {
  return Array.from(feedPostsMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
