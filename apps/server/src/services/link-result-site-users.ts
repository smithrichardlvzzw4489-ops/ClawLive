import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { DeveloperSearchResult } from './codernet-search';

export type LinkResultSiteUser = { userId: string; username: string };

/** 批量解析 GitHub login → 站内用户（大小写不敏感），供 LINK complete 行附带 `siteUser`。 */
export async function mapGitHubLoginsToSiteUsers(logins: string[]): Promise<Map<string, LinkResultSiteUser>> {
  const unique = [...new Set(logins.map((l) => l.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, LinkResultSiteUser>();
  if (unique.length === 0) return out;

  const rows = await prisma.$queryRaw<{ id: string; username: string; gh: string }[]>`
    SELECT id, username, "githubUsername" AS gh FROM users
    WHERE "githubUsername" IS NOT NULL
    AND LOWER("githubUsername") IN (${Prisma.join(unique)})
  `;

  for (const r of rows) {
    if (r.gh) out.set(r.gh.toLowerCase(), { userId: r.id, username: r.username });
  }
  return out;
}

export function enrichDeveloperResultWithSiteUser(
  r: DeveloperSearchResult,
  siteMap: Map<string, LinkResultSiteUser>,
): DeveloperSearchResult & { siteUser: LinkResultSiteUser | null } {
  const key = r.githubUsername.trim().toLowerCase();
  return {
    ...r,
    siteUser: siteMap.get(key) ?? null,
  };
}
