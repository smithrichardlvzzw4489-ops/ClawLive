/**
 * 社区帖子与评论持久化
 */
import * as fs from 'fs';
import { getDataFilePath } from '../lib/data-path';

export type PostType = 'question' | 'discussion' | 'experience' | 'retrospective';

export interface CommunityPost {
  id: string;
  authorId: string;
  type: PostType;
  title: string;
  content: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  solved?: boolean;
  skillId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const POSTS_FILE = getDataFilePath('community-posts.json');
const COMMENTS_FILE = getDataFilePath('community-comments.json');
const NEWS_FILE = getDataFilePath('community-news.json');

export interface CommunityNews {
  id: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  category: string;
  tags: string[];
  insight?: string;
  discussionCount: number;
  publishedAt: Date;
  createdAt: Date;
}

function reviveDates(obj: any): any {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (['timestamp', 'createdAt', 'updatedAt', 'publishedAt'].includes(k)) {
        out[k] = v ? new Date(v as string) : v;
      } else {
        out[k] = reviveDates(v);
      }
    }
    return out;
  }
  return obj;
}

export class CommunityPersistence {
  static loadPosts(): Map<string, CommunityPost> {
    const map = new Map<string, CommunityPost>();
    try {
      if (fs.existsSync(POSTS_FILE)) {
        const data = fs.readFileSync(POSTS_FILE, 'utf-8');
        const obj = JSON.parse(data);
        for (const [id, p] of Object.entries(obj)) {
          map.set(id, reviveDates(p) as CommunityPost);
        }
      }
    } catch (e) {
      console.error('Failed to load community posts:', e);
    }
    return map;
  }

  static loadComments(): Map<string, CommunityComment[]> {
    const map = new Map<string, CommunityComment[]>();
    try {
      if (fs.existsSync(COMMENTS_FILE)) {
        const data = fs.readFileSync(COMMENTS_FILE, 'utf-8');
        const obj = JSON.parse(data);
        for (const [postId, arr] of Object.entries(obj)) {
          map.set(postId, (arr as any[]).map((c) => reviveDates(c) as CommunityComment));
        }
      }
    } catch (e) {
      console.error('Failed to load community comments:', e);
    }
    return map;
  }

  static loadNews(): CommunityNews[] {
    try {
      if (fs.existsSync(NEWS_FILE)) {
        const data = fs.readFileSync(NEWS_FILE, 'utf-8');
        const arr = JSON.parse(data);
        return (Array.isArray(arr) ? arr : []).map((n) => reviveDates(n) as CommunityNews);
      }
    } catch (e) {
      console.error('Failed to load community news:', e);
    }
    return getDefaultNews();
  }

  static savePosts(posts: Map<string, CommunityPost>): void {
    try {
      const obj: Record<string, any> = {};
      posts.forEach((p, id) => {
        obj[id] = { ...p };
      });
      fs.writeFileSync(POSTS_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.error('Failed to save community posts:', e);
    }
  }

  static saveComments(comments: Map<string, CommunityComment[]>): void {
    try {
      const obj: Record<string, any> = {};
      comments.forEach((arr, postId) => {
        obj[postId] = arr;
      });
      fs.writeFileSync(COMMENTS_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.error('Failed to save community comments:', e);
    }
  }

  static saveNews(news: CommunityNews[]): void {
    try {
      fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
    } catch (e) {
      console.error('Failed to save community news:', e);
    }
  }
}

function getDefaultNews(): CommunityNews[] {
  const now = new Date();
  return [
    {
      id: 'news-1',
      title: 'OpenClaw Agent 生态持续演进',
      summary: 'Agent 与 Skill 订阅模式成为趋势，能力流市场逐步形成。',
      source: 'ClawLive 社区',
      category: 'Agent',
      tags: ['OpenClaw', 'Agent', 'Skill'],
      insight: '对创作者而言，可重点打磨垂直领域 Skill，形成可订阅能力。',
      discussionCount: 0,
      publishedAt: now,
      createdAt: now,
    },
    {
      id: 'news-2',
      title: 'MCP 协议推动 AI 工具互联',
      summary: 'Model Context Protocol 简化 AI 与外部工具的集成。',
      source: '行业资讯',
      category: '工具',
      tags: ['MCP', 'AI', '工具'],
      insight: '关注 MCP 生态的开发者可提前布局 Skill 与工具链。',
      discussionCount: 0,
      publishedAt: now,
      createdAt: now,
    },
    {
      id: 'news-3',
      title: 'A2A 订阅模式初探',
      summary: 'Agent-to-Agent 能力订阅或成为下一阶段重点。',
      source: '社区观察',
      category: 'Agent',
      tags: ['A2A', '能力订阅'],
      discussionCount: 0,
      publishedAt: now,
      createdAt: now,
    },
  ];
}
