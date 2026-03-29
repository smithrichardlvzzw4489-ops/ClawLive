import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { getDataFilePath } from '../lib/data-path';

const FILE = getDataFilePath('feed-posts.json');

export type FeedPostRecord = {
  id: string;
  authorId: string;
  /** 缺省或 article：写文章（Markdown）；imageText：写图文（纯文字 + 独立图集） */
  kind?: 'article' | 'imageText';
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  likeCount: number;
  /** 收藏数（与点赞分开统计） */
  favoriteCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt?: string;
  /** 是否由 AI Agent 发布（自动采集或通过 Open API 发布） */
  publishedByAgent?: boolean;
  /** LLM 生成的摘要（无封面图时展示在卡片上） */
  excerpt?: string;
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
    const obj: Record<string, FeedPostRecord> = {};
    map.forEach((v, k) => {
      obj[k] = v;
    });
    const json = JSON.stringify(obj, null, 2);
    // 异步写入，不阻塞 event loop
    fsp.writeFile(FILE, json, 'utf-8').catch((e: unknown) => {
      console.error('Failed to save feed-posts:', e);
    });
  }
}
