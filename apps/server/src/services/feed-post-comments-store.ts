import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDataFilePath } from '../lib/data-path';

const FILE = getDataFilePath('feed-post-comments.json');

export interface FeedPostCommentRecord {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

type Store = Record<string, FeedPostCommentRecord[]>;

function loadRaw(): Store {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Store;
    return raw || {};
  } catch {
    return {};
  }
}

function save(data: Store): void {
  fsp.writeFile(FILE, JSON.stringify(data, null, 2)).catch((e: unknown) => {
    console.error('Failed to save feed post comments:', e);
  });
}

function revive(list: FeedPostCommentRecord[]): FeedPostCommentRecord[] {
  return list.map((c) => ({
    ...c,
    createdAt: c.createdAt ? new Date(c.createdAt as unknown as string) : new Date(),
  }));
}

export function getFeedPostComments(postId: string): FeedPostCommentRecord[] {
  const s = loadRaw();
  return revive(s[postId] || []);
}

export function addFeedPostComment(postId: string, authorId: string, content: string): FeedPostCommentRecord {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('empty');
  const s = loadRaw();
  const arr = s[postId] ? revive(s[postId]) : [];
  const c: FeedPostCommentRecord = {
    id: `fpc-${Date.now()}-${uuidv4().slice(0, 8)}`,
    postId,
    authorId,
    content: trimmed.slice(0, 5000),
    createdAt: new Date(),
  };
  arr.push(c);
  s[postId] = arr;
  save(s);
  return c;
}
