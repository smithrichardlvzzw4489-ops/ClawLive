/**
 * GitHub 画像页侧边能力：相似用户（Search）、关系边（共同仓库贡献者聚合）。
 */

import type { GitHubCrawlResult, GHRepo } from './github-crawler';
import type { CodernetAnalysis } from './codernet-profile-analyzer';

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

/** GitHub Search `language:` 常用映射 */
function toGithubLanguageQualifier(display: string): string {
  const k = display.trim();
  const map: Record<string, string> = {
    'C++': 'cpp',
    'C#': 'csharp',
    'F#': 'fsharp',
    'Objective-C': 'objective-c',
    'ASP.NET': 'asp.net',
    'Vue.js': 'vue',
    'Node.js': 'javascript',
  };
  if (map[k]) return map[k];
  return k.replace(/\s+/g, '-').toLowerCase();
}

export type SimilarPersonRow = {
  githubUsername: string;
  avatarUrl: string;
  similarityPercent: number;
};

export type RelationPersonRow = {
  githubUsername: string;
  avatarUrl: string;
  connectionDensity: number;
  /** 供调试/高级展示 */
  rawWeight: number;
};

interface GHSearchUserItem {
  login: string;
  avatar_url: string;
  score?: number;
  type?: string;
}

/**
 * 用当前画像的语言栈在 GitHub 搜用户，排除本人，最多 100 条；相似度为搜索相关度归一化 + 序位微调。
 */
export async function fetchSimilarGitHubUsers(
  seedLogin: string,
  crawl: GitHubCrawlResult,
  analysis: CodernetAnalysis | undefined,
  token: string | undefined,
): Promise<SimilarPersonRow[]> {
  const seed = seedLogin.toLowerCase();
  const langs: string[] = [];
  if (analysis?.languageDistribution?.length) {
    for (const l of analysis.languageDistribution.slice(0, 5)) {
      if (l.language && l.percent > 0.5) langs.push(toGithubLanguageQualifier(l.language));
    }
  }
  if (langs.length === 0 && crawl.languageStats) {
    const sorted = Object.entries(crawl.languageStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => toGithubLanguageQualifier(name));
    langs.push(...sorted);
  }

  let q: string;
  if (langs.length > 0) {
    const orLang = langs.slice(0, 4).map((g) => `language:${g}`).join(' OR ');
    q = `(${orLang}) type:user -user:${seed}`;
  } else {
    q = `type:user followers:>20 -user:${seed}`;
  }

  const params = new URLSearchParams({ q, per_page: '100' });
  const url = `${GH_API}/search/users?${params.toString()}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub search users ${res.status}: ${t.slice(0, 120)}`);
  }
  const data = (await res.json()) as { items?: GHSearchUserItem[] };
  const items = (data.items || []).filter(
    (u) => u.login?.toLowerCase() !== seed && (u.type === 'User' || u.type === undefined),
  );
  const scores = items.map((u) => (typeof u.score === 'number' && u.score > 0 ? u.score : 0));
  const maxScore = Math.max(...scores, 0);

  return items.slice(0, 100).map((u, idx) => {
    let similarityPercent: number;
    if (maxScore > 0) {
      const base = typeof u.score === 'number' && u.score > 0 ? Math.min(100, (u.score / maxScore) * 100) : 0;
      const rankBoost = Math.max(0, 8 - idx * 0.08);
      similarityPercent = Math.min(100, Math.max(38, Math.round(base * 0.85 + rankBoost)));
    } else {
      similarityPercent = Math.max(42, 99 - idx);
    }
    return {
      githubUsername: u.login,
      avatarUrl: u.avatar_url,
      similarityPercent,
    };
  });
}

interface GHContributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

/**
 * 在用户高星仓库上聚合 contributors，作为「在 GitHub 上共同工程语境下出现过」的连接度。
 */
export async function fetchGitHubRelationPeople(
  seedLogin: string,
  repos: GHRepo[],
  token: string | undefined,
): Promise<RelationPersonRow[]> {
  const seed = seedLogin.toLowerCase();
  const top = [...repos]
    .filter((r) => !r.fork && r.full_name?.includes('/'))
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10);

  const weight = new Map<string, { avatar: string; w: number }>();

  for (const repo of top) {
    try {
      const url = `${GH_API}/repos/${encodeURIComponent(repo.full_name)}/contributors?per_page=100`;
      const res = await fetch(url, { headers: ghHeaders(token) });
      if (!res.ok) continue;
      const list = (await res.json()) as GHContributor[];
      for (const c of list) {
        if (!c.login || c.login.toLowerCase() === seed) continue;
        const prev = weight.get(c.login) || { avatar: c.avatar_url, w: 0 };
        prev.w += Math.min(c.contributions || 0, 500);
        if (c.avatar_url) prev.avatar = c.avatar_url;
        weight.set(c.login, prev);
      }
    } catch {
      /* skip repo */
    }
  }

  const rows = [...weight.entries()]
    .map(([login, v]) => ({ login, ...v }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 100);

  const maxW = Math.max(...rows.map((r) => r.w), 1);
  return rows.map((r) => ({
    githubUsername: r.login,
    avatarUrl: r.avatar,
    rawWeight: r.w,
    connectionDensity: Math.min(100, Math.max(5, Math.round((r.w / maxW) * 100))),
  }));
}
