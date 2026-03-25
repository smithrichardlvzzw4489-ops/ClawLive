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
  const u = String(userId);
  const h = String(hostId);
  const records = loadAll();
  return records.some((r) => String(r.userId) === u && String(r.hostId) === h);
}

export function follow(userId: string, hostId: string): boolean {
  const u = String(userId);
  const h = String(hostId);
  if (u === h) return false; // 不能关注自己
  const records = loadAll();
  if (records.some((r) => String(r.userId) === u && String(r.hostId) === h)) return true; // 已关注
  records.push({
    userId: u,
    hostId: h,
    createdAt: new Date().toISOString(),
  });
  saveAll(records);
  return true;
}

export function unfollow(userId: string, hostId: string): boolean {
  const u = String(userId);
  const h = String(hostId);
  const records = loadAll();
  const next = records.filter((r) => !(String(r.userId) === u && String(r.hostId) === h));
  if (next.length === records.length) return false;
  saveAll(next);
  return true;
}

export function getFollowerCount(hostId: string): number {
  const h = String(hostId);
  const records = loadAll();
  return records.filter((r) => String(r.hostId) === h).length;
}
