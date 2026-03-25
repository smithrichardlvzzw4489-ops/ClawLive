import * as fs from 'fs';
import { getDataFilePath } from '../lib/data-path';

const FILE = getDataFilePath('feed-posts.json');

export type FeedPostRecord = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  likeCount: number;
  /** 收藏数（与点赞分开统计） */
  favoriteCount: number;
  commentCount: number;
  createdAt: string;
};

function reviveDates(obj: unknown): FeedPostRecord {
  const o = obj as FeedPostRecord;
  if (typeof o.favoriteCount !== 'number' || Number.isNaN(o.favoriteCount)) {
    o.favoriteCount = 0;
  }
  return o;
}

export class FeedPostsPersistence {
  static load(): Map<string, FeedPostRecord> {
    const map = new Map<string, FeedPostRecord>();
    try {
      if (!fs.existsSync(FILE)) return map;
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Record<string, FeedPostRecord>;
      for (const [id, p] of Object.entries(raw)) {
        map.set(id, reviveDates(p));
      }
    } catch (e) {
      console.error('Failed to load feed-posts:', e);
    }
    return map;
  }

  static save(map: Map<string, FeedPostRecord>): void {
    try {
      const obj: Record<string, FeedPostRecord> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save feed-posts:', e);
    }
  }
}
