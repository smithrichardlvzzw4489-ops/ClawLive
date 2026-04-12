/**
 * 将邮箱解析为 GitHub 登录名：优先站内注册用户，其次 GitHub 公开 commit 搜索（author-email / committer-email）。
 */

import type { PrismaClient } from '@prisma/client';
import { getServerGitHubToken } from './github-crawler';

const GH_API = 'https://api.github.com';

function ghSearchHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GITLINK/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

interface CommitSearchItem {
  author?: { login?: string } | null;
}

interface CommitSearchResponse {
  items?: CommitSearchItem[];
}

async function collectLoginsFromCommitSearch(
  field: 'author-email' | 'committer-email',
  email: string,
  token: string | undefined,
): Promise<string[]> {
  const q = `${field}:${email}`;
  const url = `${GH_API}/search/commits?q=${encodeURIComponent(q)}&sort=committer-date&order=desc&per_page=30`;
  const res = await fetch(url, { headers: ghSearchHeaders(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub commit search ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = (await res.json()) as CommitSearchResponse;
  const logins: string[] = [];
  for (const it of data.items || []) {
    const login = it.author?.login;
    if (login && typeof login === 'string') logins.push(login.toLowerCase());
  }
  return logins;
}

export type GithubEmailResolveSource = 'local_user' | 'commit_search';

export interface GithubEmailResolveResult {
  githubUsername: string | null;
  /** 按 commit 命中次数排序，供前端展示多候选 */
  candidates: { login: string; score: number }[];
  source: GithubEmailResolveSource | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveGithubUsernameFromEmail(
  prisma: PrismaClient,
  emailRaw: string,
): Promise<GithubEmailResolveResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { githubUsername: null, candidates: [], source: null };
  }

  const local = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      githubUsername: { not: null },
    },
    select: { githubUsername: true },
  });
  const localLogin = local?.githubUsername?.trim().toLowerCase();
  if (localLogin) {
    return {
      githubUsername: localLogin,
      candidates: [{ login: localLogin, score: 1 }],
      source: 'local_user',
    };
  }

  const token = getServerGitHubToken();
  const counts = new Map<string, number>();

  for (const field of ['author-email', 'committer-email'] as const) {
    try {
      const logins = await collectLoginsFromCommitSearch(field, email, token);
      for (const L of logins) {
        counts.set(L, (counts.get(L) || 0) + 1);
      }
    } catch (e) {
      console.warn('[github-email-resolve] commit search failed', field, e);
    }
  }

  const candidates = [...counts.entries()]
    .map(([login, score]) => ({ login, score }))
    .sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));

  const githubUsername = candidates[0]?.login ?? null;
  return {
    githubUsername,
    candidates,
    source: githubUsername ? 'commit_search' : null,
  };
}
