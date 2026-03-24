/**
 * 用户关注主播 - 持久化存储
 */

import * as fs from 'fs';
import { DATA_DIR, getDataFilePath } from '../lib/data-path';

const CONFIG_FILE = getDataFilePath('user-follows.json');

interface FollowRecord {
  userId: string;
  hostId: string;
  createdAt: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAll(): FollowRecord[] {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) return [];
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveAll(records: FollowRecord[]) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(records, null, 2));
}

export function isFollowing(userId: string, hostId: string): boolean {
  const records = loadAll();
  return records.some((r) => r.userId === userId && r.hostId === hostId);
}

export function follow(userId: string, hostId: string): boolean {
  if (userId === hostId) return false; // 不能关注自己
  const records = loadAll();
  if (records.some((r) => r.userId === userId && r.hostId === hostId)) return true; // 已关注
  records.push({
    userId,
    hostId,
    createdAt: new Date().toISOString(),
  });
  saveAll(records);
  return true;
}

export function unfollow(userId: string, hostId: string): boolean {
  const records = loadAll().filter((r) => !(r.userId === userId && r.hostId === hostId));
  if (records.length === loadAll().length) return false; // 未关注过
  saveAll(records);
  return true;
}

export function getFollowerCount(hostId: string): number {
  const records = loadAll();
  return records.filter((r) => r.hostId === hostId).length;
}
