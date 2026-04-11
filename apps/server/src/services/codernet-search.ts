/**
 * Codernet 全网开发者搜索：
 * 1. LLM 解析自然语言 → GitHub Search API qualifiers
 * 2. GitHub Search API 实时搜人（/search/users）
 * 3. 批量爬取 top 候选人画像
 * 4. LLM 精排 → 返回最匹配的开发者
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import { crawlGitHubProfile, type GitHubCrawlResult } from './github-crawler';
import { analyzeGitHubProfile, type CodernetAnalysis } from './codernet-profile-analyzer';

export interface DeveloperSearchResult {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  sharpCommentary: string;
  score: number;
  reason: string;
  source: 'github_search';
  stats: {
    totalPublicRepos: number;
    totalStars: number;
    followers: number;
  };
  bio: string | null;
  location: string | null;
  capabilityQuadrant?: CodernetAnalysis['capabilityQuadrant'];
}

/* ── Phase 1: LLM 解析用户意图 → GitHub Search qualifiers ─── */

export interface ParsedQuery {
  githubQuery: string;
  sort?: 'followers' | 'repositories' | 'joined';
  order?: 'desc' | 'asc';
  explanation: string;
}

export async function parseQueryToGitHubSearch(query: string): Promise<ParsedQuery> {
  const { model } = getPublishingLlmClient();

  const prompt = `你是 GitHub Search API 查询生成器。将用户的自然语言需求转换为 GitHub Search Users API 的 q 参数。

用户需求：${query}

GitHub Search Users 支持的 qualifier：
- language:xxx（编程语言，如 language:rust）
- location:xxx（地点，如 location:shanghai、location:china）
- followers:>N 或 followers:N..M（粉丝数）
- repos:>N（仓库数）
- type:user（排除组织）
- 自由文本关键词（如 fullstack、machine-learning）

输出**仅一个 JSON 对象**：
{
  "githubQuery": "language:rust location:china followers:>50 type:user",
  "sort": "followers",
  "order": "desc",
  "explanation": "搜索在中国的 Rust 开发者，按粉丝数排序"
}

规则：
- githubQuery 必须是有效的 GitHub search users q 参数
- sort 可选值: "followers", "repositories", "joined"，或不填（默认 best-match）
- 尽量添加 type:user 排除组织账号
- 如果用户提到了具体技术栈，用 language: qualifier
- 如果用户提到了地区，用 location: qualifier
- 如果用户强调经验丰富/资深，加 followers:>100 或 repos:>30
- 关键词尽量用英文（GitHub 数据以英文为主）`;

  const response = await trackedChatCompletion(
    { model, messages: [{ role: 'user', content: prompt }], max_tokens: 300, temperature: 0.2 },
    'developer_search',
  );

  const raw = response.choices[0]?.message?.content?.trim() || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { githubQuery: `${query} type:user`, explanation: 'Direct keyword search' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParsedQuery;
    if (!parsed.githubQuery) throw new Error('missing githubQuery');
    return parsed;
  } catch {
    return { githubQuery: `${query} type:user`, explanation: 'Fallback keyword search' };
  }
}

/* ── Phase 2: GitHub Search API 搜人 ─────────────────────── */

export interface GHSearchUserItem {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: string;
  score: number;
  public_repos?: number;
  followers?: number;
  following?: number;
  bio?: string | null;
  location?: string | null;
  company?: string | null;
  blog?: string | null;
  name?: string | null;
}

interface GHSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GHSearchUserItem[];
}

/**
 * 执行 GitHub Search Users（已解析的 q）。供「相似的人」等场景复用。
 * enrichProfiles=false 时不请求 /users/:login，适合一次拉取较多候选（如 100）。
 */
export async function runGitHubUserSearchFromParsed(
  parsedQuery: ParsedQuery,
  token: string | undefined,
  opts: { perPage?: number; enrichProfiles?: boolean },
): Promise<GHSearchUserItem[]> {
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 30));
  const enrich = opts.enrichProfiles !== false;

  const params = new URLSearchParams({
    q: parsedQuery.githubQuery,
    per_page: String(perPage),
  });
  if (parsedQuery.sort) params.set('sort', parsedQuery.sort);
  if (parsedQuery.order) params.set('order', parsedQuery.order);

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/search/users?${params.toString()}`;
  console.log(`[CodernetSearch] GitHub Search: ${url}`);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[CodernetSearch] GitHub Search API ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`GitHub Search API error: ${res.status}`);
  }

  const data = (await res.json()) as GHSearchResponse;
  console.log(`[CodernetSearch] GitHub returned ${data.total_count} total, ${data.items.length} items`);

  const users = data.items.filter((u) => u.type === 'User').slice(0, perPage);
  if (!enrich) return users;

  const enriched = await Promise.allSettled(
    users.map(async (u) => {
      try {
        const profileRes = await fetch(`https://api.github.com/users/${u.login}`, { headers });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          return { ...u, ...profile } as GHSearchUserItem;
        }
      } catch {}
      return u;
    }),
  );

  return enriched
    .filter((r): r is PromiseFulfilledResult<GHSearchUserItem> => r.status === 'fulfilled')
    .map((r) => r.value);
}

async function searchGitHubUsers(
  parsedQuery: ParsedQuery,
  token?: string,
  maxResults: number = 10,
): Promise<GHSearchUserItem[]> {
  const n = Math.min(maxResults, 30);
  const rows = await runGitHubUserSearchFromParsed(parsedQuery, token, {
    perPage: n,
    enrichProfiles: true,
  });
  return rows.slice(0, maxResults);
}

/* ── Phase 3: 批量爬取 + AI 分析（lightweight，只对 top 5）── */

interface EnrichedCandidate {
  user: GHSearchUserItem;
  crawl?: GitHubCrawlResult;
  analysis?: CodernetAnalysis;
}

async function enrichCandidates(
  users: GHSearchUserItem[],
  token?: string,
  lookupCache?: Map<string, any>,
): Promise<EnrichedCandidate[]> {
  const top = users.slice(0, 10);

  const results = await Promise.allSettled(
    top.map(async (user): Promise<EnrichedCandidate> => {
      const cacheKey = user.login.toLowerCase();
      if (lookupCache?.has(cacheKey)) {
        const cached = lookupCache.get(cacheKey);
        return { user, crawl: cached.crawl, analysis: cached.analysis };
      }

      try {
        const crawl = await crawlGitHubProfile(token, user.login);

        let analysis: CodernetAnalysis | undefined;
        try {
          analysis = await analyzeGitHubProfile(crawl);
        } catch (err) {
          console.warn(`[CodernetSearch] AI analysis failed for @${user.login}:`, err);
        }

        if (lookupCache && analysis) {
          lookupCache.set(cacheKey, {
            crawl,
            analysis,
            cachedAt: Date.now(),
            avatarUrl: user.avatar_url,
          });
        }

        return { user, crawl, analysis };
      } catch (err) {
        console.warn(`[CodernetSearch] crawl failed for @${user.login}:`, err);
        return { user };
      }
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<EnrichedCandidate> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/* ── Phase 4: LLM 精排 ───────────────────────────────────── */

function buildRerankPrompt(query: string, candidates: EnrichedCandidate[]): string {
  const list = candidates.map((c, i) => {
    const u = c.user;
    const a = c.analysis;
    const tags = a?.techTags?.join(', ') || 'N/A';
    const oneLiner = a?.oneLiner || 'N/A';
    const bio = u.bio || '';
    const loc = u.location || '?';
    return `[${i}] @${u.login} | ${bio} | Location: ${loc} | Followers: ${u.followers ?? '?'} | Repos: ${u.public_repos ?? '?'} | Tags: ${tags} | AI: "${oneLiner}"`;
  }).join('\n');

  return `你是 Codernet 开发者匹配引擎。根据用户的需求，对从 GitHub 找到的候选人进行精排。

用户需求：${query}

候选人（已按 GitHub 相关性初筛）：
${list}

输出**仅一个 JSON 数组**，按匹配度降序：
[
  { "index": 0, "score": 0.95, "reason": "匹配理由（1句话中文）" },
  ...
]

规则：
- score 范围 0-1
- 最多返回 12 个，只返回 score >= 0.3 的
- reason 必须中文
- 综合考虑技术栈匹配度、经验（stars/followers/repos）、地域、AI画像分析
- 没有匹配的返回空数组 []`;
}

async function rerankCandidates(
  query: string,
  candidates: EnrichedCandidate[],
): Promise<Array<{ index: number; score: number; reason: string }>> {
  if (candidates.length === 0) return [];

  const { model } = getPublishingLlmClient();
  const prompt = buildRerankPrompt(query, candidates);

  let response;
  try {
    response = await trackedChatCompletion(
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.2, response_format: { type: 'json_object' } },
      'search_rerank',
    );
  } catch {
    response = await trackedChatCompletion(
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.2 },
      'search_rerank',
    );
  }

  const raw = response.choices[0]?.message?.content?.trim() || '[]';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r: any) => typeof r.index === 'number' && typeof r.score === 'number');
  } catch {
    return [];
  }
}

/* ── Main: 完整搜索流水线 ─────────────────────────────────── */

export interface SearchProgress {
  phase: 'parsing' | 'searching' | 'enriching' | 'ranking' | 'done' | 'error';
  detail: string;
  githubQuery?: string;
  totalFound?: number;
}

export async function searchDevelopers(
  query: string,
  lookupCache: Map<string, any>,
  token?: string,
  onProgress?: (p: SearchProgress) => void,
): Promise<DeveloperSearchResult[]> {
  onProgress?.({ phase: 'parsing', detail: 'AI is understanding your query...' });

  const parsed = await parseQueryToGitHubSearch(query);
  console.log(`[CodernetSearch] parsed: "${parsed.githubQuery}" (${parsed.explanation})`);

  onProgress?.({
    phase: 'searching',
    detail: `Searching GitHub: ${parsed.githubQuery}`,
    githubQuery: parsed.githubQuery,
  });

  const ghUsers = await searchGitHubUsers(parsed, token, 24);
  if (ghUsers.length === 0) {
    onProgress?.({ phase: 'done', detail: 'No GitHub users found', totalFound: 0 });
    return [];
  }

  onProgress?.({
    phase: 'enriching',
    detail: `Analyzing top ${Math.min(ghUsers.length, 10)} developers...`,
    totalFound: ghUsers.length,
  });

  const enriched = await enrichCandidates(ghUsers, token, lookupCache);

  onProgress?.({ phase: 'ranking', detail: 'AI is ranking the best matches...' });

  const ranked = await rerankCandidates(query, enriched);

  const results: DeveloperSearchResult[] = ranked
    .filter((r) => r.score >= 0.3 && r.index >= 0 && r.index < enriched.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((r) => {
      const c = enriched[r.index];
      return {
        githubUsername: c.user.login,
        avatarUrl: c.user.avatar_url,
        oneLiner: c.analysis?.oneLiner || '',
        techTags: c.analysis?.techTags || [],
        sharpCommentary: c.analysis?.sharpCommentary || '',
        score: r.score,
        reason: r.reason,
        source: 'github_search' as const,
        stats: {
          totalPublicRepos: c.user.public_repos ?? c.crawl?.totalPublicRepos ?? 0,
          totalStars: c.crawl?.totalStars ?? 0,
          followers: c.user.followers ?? c.crawl?.followers ?? 0,
        },
        bio: c.user.bio ?? c.crawl?.bio ?? null,
        location: c.user.location ?? c.crawl?.location ?? null,
        capabilityQuadrant: c.analysis?.capabilityQuadrant,
      };
    });

  onProgress?.({ phase: 'done', detail: `Found ${results.length} matches`, totalFound: results.length });

  return results;
}
