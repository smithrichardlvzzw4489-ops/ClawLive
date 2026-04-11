/**
 * GitHub 画像页侧边能力：相似用户（LLM→GitHub Search）、关系边（共同仓库贡献者聚合）。
 */

import type { GitHubCrawlResult, GHRepo } from './github-crawler';
import type { CodernetAnalysis } from './codernet-profile-analyzer';
import {
  parseQueryToGitHubSearch,
  runGitHubUserSearchFromParsed,
  type ParsedQuery,
  type GHSearchUserItem,
} from './codernet-search';

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

export type SimilarPersonRow = {
  githubUsername: string;
  avatarUrl: string;
  similarityPercent: number;
};

export type RelationPersonRow = {
  githubUsername: string;
  avatarUrl: string;
  connectionDensity: number;
  rawWeight: number;
};

/** 将种子画像综合信息拼成自然语言，交给 parseQueryToGitHubSearch 生成 GitHub q */
function buildSimilarProfileNarrative(
  seedLogin: string,
  crawl: GitHubCrawlResult,
  analysis: CodernetAnalysis | undefined,
): string {
  const lines: string[] = [
    `【任务】找出与下列「种子开发者」在技术栈、工程领域、影响力层级上相近的其他 GitHub 用户；不要包含该种子本人。`,
    `【种子登录】@${seedLogin}`,
    `【公开数据】公开仓库约 ${crawl.totalPublicRepos} 个，粉丝 ${crawl.followers}，自有仓库星标总和约 ${crawl.totalStars}。`,
  ];
  if (crawl.bio?.trim()) lines.push(`【Bio】${crawl.bio.trim().slice(0, 420)}`);
  if (crawl.location?.trim()) lines.push(`【地区】${crawl.location.trim()}`);
  if (crawl.company?.trim()) lines.push(`【公司/组织文案】${crawl.company.trim().slice(0, 160)}`);
  if (analysis?.oneLiner?.trim()) lines.push(`【AI 一句话画像】${analysis.oneLiner.trim()}`);
  if (analysis?.sharpCommentary?.trim()) {
    lines.push(`【AI 锐评/技术气质】${analysis.sharpCommentary.trim().slice(0, 700)}`);
  }
  if (analysis?.techTags?.length) {
    lines.push(`【技术标签】${analysis.techTags.slice(0, 28).join('，')}`);
  }
  if (analysis?.languageDistribution?.length) {
    const langStr = analysis.languageDistribution
      .filter((l) => l.percent >= 0.5)
      .map((l) => `${l.language} ${l.percent.toFixed(1)}%`)
      .join('；');
    if (langStr) lines.push(`【仓库语言占比】${langStr}`);
  }
  if (analysis?.capabilityQuadrant) {
    const q = analysis.capabilityQuadrant;
    lines.push(
      `【能力象限 0–100】前端 ${Math.round(q.frontend)}，后端 ${Math.round(q.backend)}，基建 ${Math.round(q.infra)}，AI/ML ${Math.round(q.ai_ml)}`,
    );
  }
  if (analysis?.platformsUsed?.length) {
    lines.push(`【分析中出现的平台】${analysis.platformsUsed.join('，')}`);
  }
  const topicPool = (crawl.repos || [])
    .filter((r) => !r.fork && r.topics?.length)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10)
    .flatMap((r) => r.topics || []);
  const uniqTopics = [...new Set(topicPool)].slice(0, 24);
  if (uniqTopics.length) lines.push(`【高星仓库常见 topics】${uniqTopics.join('，')}`);

  lines.push(
    '请综合以上信息构造一条 GitHub Search Users 的 q：兼顾主要语言、合理粉丝/仓库量级、与领域相关的英文关键词；避免只用一个 language。',
  );
  return lines.join('\n');
}

function ensureQueryExcludesSeed(q: string, seed: string): string {
  let s = q.replace(/\s+/g, ' ').trim();
  const seedL = seed.toLowerCase();
  const exclusion = `-user:${seedL}`;
  if (!s.toLowerCase().includes(exclusion)) s = `${s} ${exclusion}`.trim();
  if (!/\btype:user\b/i.test(s)) s = `${s} type:user`.trim();
  return s;
}

/**
 * 用 LLM 根据画像综合叙述生成 GitHub Search，再拉最多 100 人；相似度来自搜索 score 或序位。
 */
export async function fetchSimilarGitHubUsers(
  seedLogin: string,
  crawl: GitHubCrawlResult,
  analysis: CodernetAnalysis | undefined,
  token: string | undefined,
): Promise<SimilarPersonRow[]> {
  const seed = seedLogin.toLowerCase();
  const narrative = buildSimilarProfileNarrative(seed, crawl, analysis);
  const parsed = await parseQueryToGitHubSearch(narrative);
  const merged: ParsedQuery = {
    ...parsed,
    githubQuery: ensureQueryExcludesSeed(parsed.githubQuery, seed),
  };
  console.log(
    `[GitHubProfileGraph] similar LLM q="${merged.githubQuery}" (${parsed.explanation})`,
  );

  let items: GHSearchUserItem[];
  try {
    items = await runGitHubUserSearchFromParsed(merged, token, { perPage: 100, enrichProfiles: false });
  } catch (e) {
    console.warn('[GitHubProfileGraph] similar primary search failed, retrying looser query', e);
    const fallback = await parseQueryToGitHubSearch(
      `${narrative}\n\n【重试】上次生成的 q 可能过严。请生成更宽松但仍与领域相关的 GitHub users q，务必保留 type:user 与排除本人。`,
    );
    const merged2: ParsedQuery = {
      ...fallback,
      githubQuery: ensureQueryExcludesSeed(fallback.githubQuery, seed),
    };
    items = await runGitHubUserSearchFromParsed(merged2, token, { perPage: 100, enrichProfiles: false });
  }

  const filtered = items.filter((u) => u.login?.toLowerCase() !== seed);
  const scores = filtered.map((u) => (typeof u.score === 'number' && u.score > 0 ? u.score : 0));
  const maxScore = Math.max(...scores, 0);

  return filtered.slice(0, 100).map((u, idx) => {
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
