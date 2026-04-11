/**
 * GITLINK 首页三个 Tab 对应的接口调用次数（累计，按月不重置）。
 * - minePortrait: POST /api/codernet/crawl（我的画像）
 * - githubPortrait: POST /api/codernet/github/:user 且已登录扣 profile_lookup 时（GitHub 画像）
 * - linkSearch: POST /api/codernet/search 且已登录扣 search 时（LINK）
 */

import fs from 'fs';
import path from 'path';

export type CodernetInterfaceSource = 'minePortrait' | 'githubPortrait' | 'linkSearch';

export interface CodernetInterfaceCounts {
  minePortrait: number;
  githubPortrait: number;
  linkSearch: number;
}

const EMPTY: CodernetInterfaceCounts = { minePortrait: 0, githubPortrait: 0, linkSearch: 0 };

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'codernet-interface-usage.json');

const usageMap = new Map<string, CodernetInterfaceCounts>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as {
      users?: Record<string, Partial<CodernetInterfaceCounts>>;
    };
    if (!raw.users || typeof raw.users !== 'object') return;
    for (const [userId, row] of Object.entries(raw.users)) {
      if (!userId) continue;
      usageMap.set(userId, {
        minePortrait: Math.max(0, Number(row.minePortrait) || 0),
        githubPortrait: Math.max(0, Number(row.githubPortrait) || 0),
        linkSearch: Math.max(0, Number(row.linkSearch) || 0),
      });
    }
  } catch {
    /* ignore */
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const users: Record<string, CodernetInterfaceCounts> = {};
      for (const [k, v] of usageMap) users[k] = { ...v };
      fs.writeFileSync(DATA_FILE, JSON.stringify({ users }, null, 2), 'utf-8');
    } catch {
      /* non-critical */
    }
  }, 800);
}

loadFromDisk();
setInterval(() => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const users: Record<string, CodernetInterfaceCounts> = {};
    for (const [k, v] of usageMap) users[k] = { ...v };
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users }, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
}, 30_000);

export function recordCodernetInterfaceUsage(userId: string | null | undefined, source: CodernetInterfaceSource): void {
  if (!userId || typeof userId !== 'string') return;
  const prev = usageMap.get(userId) || { ...EMPTY };
  const next = { ...prev, [source]: prev[source] + 1 };
  usageMap.set(userId, next);
  scheduleSave();
}

export function getCodernetInterfaceUsageForUser(userId: string): CodernetInterfaceCounts {
  return usageMap.get(userId) ? { ...usageMap.get(userId)! } : { ...EMPTY };
}
