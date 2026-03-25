import * as fs from 'fs';
import { getDataFilePath } from '../lib/data-path';
import type { FeedPostRecord } from './feed-posts-persistence';

const FILE = getDataFilePath('feed-post-reactions.json');

type Reactions = { likes: string[]; favorites: string[] };

const byPost = new Map<string, Reactions>();

function load() {
  if (!fs.existsSync(FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Record<string, Reactions>;
    for (const [k, v] of Object.entries(raw)) {
      byPost.set(k, { likes: v?.likes ?? [], favorites: v?.favorites ?? [] });
    }
  } catch (e) {
    console.error('Failed to load feed-post-reactions:', e);
  }
}

function persist() {
  try {
    const o: Record<string, Reactions> = {};
    byPost.forEach((v, k) => {
      o[k] = { likes: [...v.likes], favorites: [...v.favorites] };
    });
    fs.writeFileSync(FILE, JSON.stringify(o, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save feed-post-reactions:', e);
  }
}

load();

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
  } else {
    r.likes.push(userId);
    p.likeCount = (p.likeCount ?? 0) + 1;
  }
  persist();
  return { liked: i < 0 };
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
  } else {
    r.favorites.push(userId);
    p.favoriteCount = (p.favoriteCount ?? 0) + 1;
  }
  persist();
  return { favorited: i < 0 };
}
