/**
 * GitHub 数据爬取：仓库、语言分布、该用户在各公开仓的 commit（REST 分页，默认单仓与总量有上限以控制耗时；可用环境变量放宽）。
 * 支持 Bearer：GITHUB_SERVER_TOKEN（推荐）或 GITHUB_TOKEN / GH_TOKEN；未配置时走匿名（约 60 req/hr/IP，易被限流）。
 */

import { buildPortfolioDepth, type PortfolioDepth } from './github-portfolio-depth';

const GH_API = 'https://api.github.com';

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** 服务端调用 GitHub REST API 时使用的 PAT（勿使用 OAuth client_secret 作为 Bearer）。 */
export function getServerGitHubToken(): string | undefined {
  const a = process.env.GITHUB_SERVER_TOKEN?.trim();
  const b = process.env.GITHUB_TOKEN?.trim();
  const c = process.env.GH_TOKEN?.trim();
  return a || b || c || undefined;
}

export interface GHRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  html_url: string;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

export interface GHCommitSample {
  repo: string;
  message: string;
  date: string;
}

export interface GitHubCrawlResult {
  username: string;
  crawledAt: string;
  repos: GHRepo[];
  languageStats: Record<string, number>;
  recentCommits: GHCommitSample[];
  totalPublicRepos: number;
  totalStars: number;
  followers: number;
  following: number;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  /** GitHub 用户选择公开的邮箱（多数用户为空） */
  email: string | null;
  /** GitHub 关联的 X (Twitter) 用户名（若有） */
  twitterUsername: string | null;
  /** 由 repos + recentCommits 派生的时间线与多视角列表 */
  portfolioDepth?: PortfolioDepth;
}

async function ghFetch<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 280);
    const rateLimited = res.status === 403 && /rate limit/i.test(snippet);
    const hint = rateLimited
      ? token
        ? '（已带 Token 仍限流：请稍后重试，或检查 Token 权限/是否与其他服务共用配额。）'
        : '（匿名 IP 限流：请在部署环境配置 GITHUB_SERVER_TOKEN 或 GITHUB_TOKEN / GH_TOKEN 以提高额度。）'
      : '';
    throw new Error(`GitHub API ${res.status}: ${snippet}${hint}`);
  }
  return res.json() as Promise<T>;
}

interface GHUserProfile {
  login: string;
  public_repos: number;
  followers: number;
  following: number;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  /** 用户选择在 GitHub 公开的邮箱时才有值 */
  email?: string | null;
  twitter_username?: string | null;
}

/**
 * Fetch user's top repos sorted by stars (non-fork), up to 50.
 */
async function fetchTopRepos(token: string | undefined, username: string): Promise<GHRepo[]> {
  const allRepos: GHRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await ghFetch<GHRepo[]>(
      `${GH_API}/users/${username}/repos?type=owner&sort=pushed&per_page=100&page=${page}`,
      token,
    );
    allRepos.push(...batch);
    if (batch.length < 100) break;
  }
  return allRepos
    .filter((r) => !r.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 50);
}

/**
 * Aggregate language bytes across top repos.
 */
async function fetchLanguageStats(
  token: string | undefined,
  repos: GHRepo[],
): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  const top = repos.slice(0, 20);
  const results = await Promise.allSettled(
    top.map((r) =>
      ghFetch<Record<string, number>>(
        `${GH_API}/repos/${r.full_name}/languages`,
        token,
      ),
    ),
  );
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const [lang, bytes] of Object.entries(result.value)) {
        stats[lang] = (stats[lang] || 0) + bytes;
      }
    }
  }
  return stats;
}

function clampIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 单仓 commits 列表最多请求页数（每页 100）。默认 15 → 单仓约 ≤1500 条，避免 linux 类巨仓拖数分钟。 */
const COMMIT_PAGES_PER_REPO_MAX = clampIntEnv('GITHUB_COMMIT_PAGES_PER_REPO_MAX', 15, 1, 500);
/** 合并去重后保留的 commit 条数上限（按时间新→旧）。默认 6000。 */
const COMMIT_TOTAL_CAP = clampIntEnv('GITHUB_COMMIT_TOTAL_CAP', 6000, 500, 80000);
const COMMITS_PER_PAGE = 100;
const REPO_FETCH_CONCURRENCY = 5;

type GHCommitApiRow = { commit: { message: string; author: { date: string } } };

async function fetchCommitsForRepo(
  token: string | undefined,
  username: string,
  r: GHRepo,
): Promise<GHCommitSample[]> {
  const out: GHCommitSample[] = [];
  for (let page = 1; page <= COMMIT_PAGES_PER_REPO_MAX; page++) {
    try {
      const batch = await ghFetch<GHCommitApiRow[]>(
        `${GH_API}/repos/${r.full_name}/commits?author=${encodeURIComponent(username)}&per_page=${COMMITS_PER_PAGE}&page=${page}`,
        token,
      );
      if (!batch.length) break;
      for (const c of batch) {
        const line = c.commit.message.split('\n')[0].slice(0, 240);
        out.push({ repo: r.name, message: line, date: c.commit.author.date });
      }
      if (batch.length < COMMITS_PER_PAGE) break;
    } catch {
      break;
    }
  }
  return out;
}

/**
 * 在用户全部非 fork 公开仓中分页拉取该 author 的 commits，合并去重后按时间新→旧排序，并截断到 COMMIT_TOTAL_CAP。
 */
async function fetchRecentCommits(
  token: string | undefined,
  username: string,
  repos: GHRepo[],
): Promise<GHCommitSample[]> {
  const merged: GHCommitSample[] = [];
  for (let i = 0; i < repos.length; i += REPO_FETCH_CONCURRENCY) {
    const slice = repos.slice(i, i + REPO_FETCH_CONCURRENCY);
    const batches = await Promise.all(slice.map((r) => fetchCommitsForRepo(token, username, r)));
    for (const arr of batches) merged.push(...arr);
  }
  const seen = new Set<string>();
  const deduped: GHCommitSample[] = [];
  for (const c of merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())) {
    const key = `${c.repo}|${c.date}|${c.message.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
    if (deduped.length >= COMMIT_TOTAL_CAP) break;
  }
  return deduped;
}

export type CrawlProgressCallback = (stage: string, detail: string) => void;

/**
 * Full crawl: profile + repos + languages + commits.
 */
export async function crawlGitHubProfile(
  token: string | undefined,
  username: string,
  onProgress?: CrawlProgressCallback,
): Promise<GitHubCrawlResult> {
  const profile = await ghFetch<GHUserProfile>(`${GH_API}/users/${username}`, token);
  const profileEmail = profile.email ?? null;
  const profileTwitter = profile.twitter_username?.trim() || null;

  onProgress?.('fetching_repos', `Fetching repositories for @${username}...`);
  const repos = await fetchTopRepos(token, username);

  onProgress?.('fetching_languages', `Analyzing languages across ${Math.min(repos.length, 20)} repos...`);
  const langPromise = fetchLanguageStats(token, repos);

  onProgress?.('fetching_commits', `Fetching commits across ${repos.length} repositories...`);
  const commitPromise = fetchRecentCommits(token, username, repos);

  const [languageStats, recentCommits] = await Promise.all([langPromise, commitPromise]);

  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);

  const mappedRepos = repos.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    topics: r.topics || [],
    html_url: r.html_url,
    fork: r.fork,
    created_at: r.created_at,
    updated_at: r.updated_at,
    pushed_at: r.pushed_at,
  }));

  const base: GitHubCrawlResult = {
    username,
    crawledAt: new Date().toISOString(),
    repos: mappedRepos,
    languageStats,
    recentCommits,
    totalPublicRepos: profile.public_repos,
    totalStars,
    followers: profile.followers,
    following: profile.following,
    bio: profile.bio,
    location: profile.location,
    company: profile.company,
    blog: profile.blog,
    email: profileEmail,
    twitterUsername: profileTwitter,
  };

  return {
    ...base,
    portfolioDepth: buildPortfolioDepth(base),
  };
}
