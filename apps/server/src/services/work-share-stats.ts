import * as fs from 'fs';
import { getDataFilePath } from '../lib/data-path';

const FILE = getDataFilePath('work-share-stats.json');

type Store = Record<string, number>;

function loadRaw(): Store {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Store;
  } catch {
    return {};
  }
}

function save(data: Store): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save work share stats:', e);
  }
}

export function getShareCount(workId: string): number {
  const n = loadRaw()[workId];
  return typeof n === 'number' && n >= 0 ? n : 0;
}

export function incrementShareCount(workId: string): number {
  const s = loadRaw();
  const next = (s[workId] || 0) + 1;
  s[workId] = next;
  save(s);
  return next;
}
