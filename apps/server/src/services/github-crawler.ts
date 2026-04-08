/**
 * GitHub 数据爬取：仓库、语言分布、近期 commit 消息。
 * 使用用户的 GitHub access token 调用 GitHub REST API。
 */

const GH_API = 'https://api.github.com';

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
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
}

async function ghFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
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
}

/**
 * Fetch user's top repos sorted by stars (non-fork), up to 50.
 */
async function fetchTopRepos(token: string, username: string): Promise<GHRepo[]> {
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
  token: string,
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

/**
 * Fetch recent commits from top repos (sample up to 30 total).
 */
async function fetchRecentCommits(
  token: string,
  username: string,
  repos: GHRepo[],
): Promise<GHCommitSample[]> {
  const top5 = repos.slice(0, 5);
  const commits: GHCommitSample[] = [];
  const results = await Promise.allSettled(
    top5.map((r) =>
      ghFetch<Array<{ commit: { message: string; author: { date: string } } }>>(
        `${GH_API}/repos/${r.full_name}/commits?author=${username}&per_page=6`,
        token,
      ),
    ),
  );
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      for (const c of result.value) {
        commits.push({
          repo: top5[i].name,
          message: c.commit.message.split('\n')[0].slice(0, 200),
          date: c.commit.author.date,
        });
      }
    }
  }
  return commits
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30);
}

export type CrawlProgressCallback = (stage: string, detail: string) => void;

/**
 * Full crawl: profile + repos + languages + commits.
 */
export async function crawlGitHubProfile(
  token: string,
  username: string,
  onProgress?: CrawlProgressCallback,
): Promise<GitHubCrawlResult> {
  const profile = await ghFetch<GHUserProfile>(`${GH_API}/users/${username}`, token);

  onProgress?.('fetching_repos', `Fetching repositories for @${username}...`);
  const repos = await fetchTopRepos(token, username);

  onProgress?.('fetching_languages', `Analyzing languages across ${Math.min(repos.length, 20)} repos...`);
  const langPromise = fetchLanguageStats(token, repos);

  onProgress?.('fetching_commits', `Scanning recent commits...`);
  const commitPromise = fetchRecentCommits(token, username, repos);

  const [languageStats, recentCommits] = await Promise.all([langPromise, commitPromise]);

  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);

  return {
    username,
    crawledAt: new Date().toISOString(),
    repos: repos.map((r) => ({
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
    })),
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
  };
}
