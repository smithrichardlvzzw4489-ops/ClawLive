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
