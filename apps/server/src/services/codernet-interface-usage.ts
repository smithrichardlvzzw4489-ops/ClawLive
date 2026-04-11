/**
 * GITLINK 首页三个 Tab 对应的接口调用次数（累计，存 PostgreSQL users 表）。
 * - minePortrait: POST /api/codernet/crawl（我的画像）
 * - githubPortrait: POST /api/codernet/github/:user 且已登录 / Agent Key 扣 profile_lookup（GitHub 画像）
 * - linkSearch: POST /api/codernet/search 且已登录扣 search（LINK）
 *
 * 历史：曾写入 `.data/codernet-interface-usage.json`；启动时 `migrateLegacyCodernetInterfaceUsageFromDisk` 会合并进库并重命名源文件。
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

export type CodernetInterfaceSource = 'minePortrait' | 'githubPortrait' | 'linkSearch';

/** GitHub 画像页「复制链接 / 下载长图 / 系统分享」——仅已登录 POST /api/codernet/portrait-share 时累加 */
export type CodernetPortraitShareAction = 'copyLink' | 'downloadPng' | 'nativeShare';

const DATA_DIR = path.join(process.cwd(), '.data');
const LEGACY_FILE = path.join(DATA_DIR, 'codernet-interface-usage.json');

export async function recordCodernetInterfaceUsage(
  userId: string | null | undefined,
  source: CodernetInterfaceSource,
): Promise<void> {
  if (!userId || typeof userId !== 'string') return;
  const data =
    source === 'minePortrait'
      ? { codernetMinePortraitCalls: { increment: 1 } }
      : source === 'githubPortrait'
        ? { codernetGithubPortraitCalls: { increment: 1 } }
        : { codernetLinkSearchCalls: { increment: 1 } };
  try {
    await prisma.user.update({ where: { id: userId }, data });
  } catch (e) {
    console.warn('[GITLINK] codernet interface usage increment failed:', userId, source, e);
  }
}

export async function recordCodernetPortraitShareUsage(
  userId: string | null | undefined,
  action: CodernetPortraitShareAction,
): Promise<void> {
  if (!userId || typeof userId !== 'string') return;
  const data =
    action === 'copyLink'
      ? { codernetPortraitShareCopyCalls: { increment: 1 } }
      : action === 'downloadPng'
        ? { codernetPortraitShareDownloadCalls: { increment: 1 } }
        : { codernetPortraitShareNativeCalls: { increment: 1 } };
  try {
    await prisma.user.update({ where: { id: userId }, data });
  } catch (e) {
    console.warn('[GITLINK] codernet portrait share increment failed:', userId, action, e);
  }
}

/** 将单机 JSON 中的累计次数合并进 users（成功后重命名源文件，避免重复合并） */
export async function migrateLegacyCodernetInterfaceUsageFromDisk(): Promise<void> {
  if (!fs.existsSync(LEGACY_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf-8')) as {
      users?: Record<string, { minePortrait?: number; githubPortrait?: number; linkSearch?: number }>;
    };
    const users = raw.users && typeof raw.users === 'object' ? raw.users : {};
    for (const [userId, row] of Object.entries(users)) {
      if (!userId) continue;
      const mine = Math.max(0, Number(row.minePortrait) || 0);
      const gh = Math.max(0, Number(row.githubPortrait) || 0);
      const link = Math.max(0, Number(row.linkSearch) || 0);
      if (mine + gh + link === 0) continue;
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            codernetMinePortraitCalls: { increment: mine },
            codernetGithubPortraitCalls: { increment: gh },
            codernetLinkSearchCalls: { increment: link },
          },
        });
      } catch {
        /* 用户已删除等 */
      }
    }
    const bak = `${LEGACY_FILE}.migrated.${Date.now()}.bak`;
    fs.renameSync(LEGACY_FILE, bak);
    console.log(`[GITLINK] Merged legacy codernet interface counts into DB; archived ${bak}`);
  } catch (e) {
    console.warn('[GITLINK] Legacy codernet-interface-usage migrate failed:', e);
  }
}
