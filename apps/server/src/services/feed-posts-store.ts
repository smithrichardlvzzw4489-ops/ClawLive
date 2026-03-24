import { FeedPostsPersistence, FeedPostRecord } from './feed-posts-persistence';

const feedPostsMap = new Map<string, FeedPostRecord>();
FeedPostsPersistence.load().forEach((v, k) => feedPostsMap.set(k, v));

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
