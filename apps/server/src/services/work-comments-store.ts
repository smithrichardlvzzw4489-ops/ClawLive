import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDataFilePath } from '../lib/data-path';

const FILE = getDataFilePath('work-comments.json');

export interface WorkCommentRecord {
  id: string;
  workId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

type Store = Record<string, WorkCommentRecord[]>;

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
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save work comments:', e);
  }
}

function revive(list: WorkCommentRecord[]): WorkCommentRecord[] {
  return list.map((c) => ({
    ...c,
    createdAt: c.createdAt ? new Date(c.createdAt as unknown as string) : new Date(),
  }));
}

export function getWorkComments(workId: string): WorkCommentRecord[] {
  const s = loadRaw();
  return revive(s[workId] || []);
}

export function getWorkCommentCount(workId: string): number {
  return getWorkComments(workId).length;
}

export function addWorkComment(workId: string, authorId: string, content: string): WorkCommentRecord {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('empty');
  const s = loadRaw();
  const arr = s[workId] ? revive(s[workId]) : [];
  const c: WorkCommentRecord = {
    id: `wc-${Date.now()}-${uuidv4().slice(0, 8)}`,
    workId,
    authorId,
    content: trimmed.slice(0, 5000),
    createdAt: new Date(),
  };
  arr.push(c);
  s[workId] = arr;
  save(s);
  return c;
}
