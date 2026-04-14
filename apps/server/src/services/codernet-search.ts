/**
 * Codernet 全网开发者搜索：
 * 1. LLM 解析自然语言 → GitHub Search API qualifiers
 * 2. GitHub Search API 实时搜人（/search/users；自动 followers/repos 分桶 + 大国地区分片 + 合并，缓解单次约 1000 条上限）
 * 3. 批量爬取 top 候选人画像
 * 4. LLM 精排 → 返回最匹配的开发者
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import { crawlGitHubProfile, type GitHubCrawlResult } from './github-crawler';
import { analyzeGitHubProfile, type CodernetAnalysis } from './codernet-profile-analyzer';
import { collectJobSeekingSignals, textLooksJobSeeking } from './job-seeking-signals';

/** LINK 结果分桶（与 HR 筛选维度对齐） */
export type LinkSearchBucketKey =
  | 'jobSeekingAndContact'
  | 'jobSeekingOnly'
  | 'contactOnly'
  | 'neither';

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
  /** LINK：求职意向（公开文案/ README / 个人站等） */
  hasJobSeekingIntent?: boolean;
  /** LINK：公开邮箱 / blog / X 等可触达线索 */
  hasContact?: boolean;
  linkBucket?: LinkSearchBucketKey;
}

export interface LinkSearchBuckets {
  jobSeekingAndContact: DeveloperSearchResult[];
  jobSeekingOnly: DeveloperSearchResult[];
  contactOnly: DeveloperSearchResult[];
  neither: DeveloperSearchResult[];
}

export interface SearchDevelopersResponse {
  results: DeveloperSearchResult[];
  buckets: LinkSearchBuckets;
  meta: { mergedGithubCount: number; enrichedCount: number };
}

function getLinkSearchMaxMerged(): number {
  const n = parseInt(process.env.LINK_SEARCH_MAX_MERGED_CANDIDATES || '2000', 10);
  return Number.isFinite(n) ? Math.min(8000, Math.max(50, n)) : 2000;
}

function getEnrichConcurrency(): number {
  const n = parseInt(process.env.LINK_SEARCH_ENRICH_CONCURRENCY || '4', 10);
  return Number.isFinite(n) ? Math.min(12, Math.max(1, n)) : 4;
}

/* ── Phase 1: LLM 解析用户意图 → GitHub Search qualifiers ─── */

export interface ParsedQuery {
  githubQuery: string;
  sort?: 'followers' | 'repositories' | 'joined';
  order?: 'desc' | 'asc';
  explanation: string;
  /**
   * 可选：多条完整 GitHub `q`（每条均须合法），用互斥的 followers:/repos: 等区间绕过单次搜索 1000 条上限。
   * 若与主查询合计 ≥2 条则优先采用；否则服务端按粉丝区间自动分桶。
   */
  shardQueries?: string[];
}

/** 自动分片生成的 q 条数上限（避免 Search API 请求过多）。 */
export const GITHUB_SEARCH_AUTO_QUERY_CAP = 12;

/** 主查询里是否已包含 followers 相关限定。 */
export function githubUserQueryHasFollowersQualifier(q: string): boolean {
  return /\bfollowers:/i.test(q);
}

/** 主查询里是否已包含 repos 相关限定。 */
export function githubUserQueryHasReposQualifier(q: string): boolean {
  return /\brepos:/i.test(q);
}

function appendQualifierSuffix(baseGithubQuery: string, suffix: string): string {
  return `${baseGithubQuery.trim()} ${suffix}`.replace(/\s+/g, ' ').trim();
}

/** 按粉丝区间拆成多条 q（与 repos 分桶正交，可并行使用）。 */
export function buildFollowerBucketGithubQueries(baseGithubQuery: string): string[] {
  const b = baseGithubQuery.trim();
  const buckets = ['followers:1..500', 'followers:501..5000', 'followers:5001..50000', 'followers:50001..2000000'];
  return buckets.map((s) => appendQualifierSuffix(b, s));
}

/** 按公开仓库数区间拆成多条 q（与 followers 分桶正交）。 */
export function buildReposBucketGithubQueries(baseGithubQuery: string): string[] {
  const b = baseGithubQuery.trim();
  const buckets = ['repos:1..25', 'repos:26..150', 'repos:151..800', 'repos:801..50000'];
  return buckets.map((s) => appendQualifierSuffix(b, s));
}

const LOCATION_BROAD_ALIASES: Record<string, string> = {
  us: 'usa',
  'u.s.': 'usa',
  'u.s': 'usa',
  usa: 'usa',
  america: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  uk: 'united kingdom',
  'u.k.': 'united kingdom',
  'u.k': 'united kingdom',
  england: 'united kingdom',
  britain: 'united kingdom',
  prc: 'china',
  mainland: 'china',
  eu: 'europe',
};

/** 国家/大区级 location → 若干代表性城市分片（英文地名与 GitHub 常见 profile 一致）。 */
const BROAD_LOCATION_CITIES: Record<string, string[]> = {
  china: ['Beijing', 'Shanghai', 'Shenzhen', 'Hangzhou'],
  usa: ['San Francisco', 'New York', 'Seattle', 'Austin'],
  india: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad'],
  'united kingdom': ['London', 'Manchester', 'Edinburgh', 'Bristol'],
  canada: ['Toronto', 'Vancouver', 'Montreal', 'Calgary'],
  australia: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
  japan: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama'],
  germany: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
  france: ['Paris', 'Lyon', 'Toulouse', 'Nice'],
  brazil: ['Sao Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasilia'],
  europe: ['London', 'Berlin', 'Paris', 'Amsterdam'],
};

function extractFirstLocationFromQuery(q: string): { raw: string; value: string } | null {
  const quoted = q.match(/\blocation:\s*"([^"]+)"/i);
  if (quoted) return { raw: quoted[0], value: quoted[1].trim() };
  const plain = q.match(/\blocation:\s*([^\s]+)/i);
  if (plain) return { raw: plain[0], value: plain[1].trim() };
  return null;
}

/** 去掉首个 location: 限定，便于替换为城市分片。 */
export function stripLocationFromQuery(q: string): string {
  return q
    .replace(/\blocation:\s*"[^"]*"\s*/i, ' ')
    .replace(/\blocation:\s*[^\s]+\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBroadLocationKey(raw: string): string | null {
  const s = raw.replace(/^["']|["']$/g, '').trim().toLowerCase();
  if (!s) return null;
  const aliased = LOCATION_BROAD_ALIASES[s] || s;
  if (BROAD_LOCATION_CITIES[aliased]) return aliased;
  if (BROAD_LOCATION_CITIES[s]) return s;
  return null;
}

function appendLocationCityToQuery(baseWithoutLocation: string, city: string): string {
  const loc = city.includes(' ') ? `location:"${city}"` : `location:${city}`;
  return appendQualifierSuffix(baseWithoutLocation, loc);
}

/**
 * 若 location 为国家/大区等宽泛词，则展开为多个城市 query；否则返回单元素 [primary]。
 */
export function expandBroadLocationVariants(primary: string): string[] {
  const hit = extractFirstLocationFromQuery(primary);
  if (!hit) return [primary];
  const key = normalizeBroadLocationKey(hit.value);
  if (!key) return [primary];
  const cities = BROAD_LOCATION_CITIES[key];
  if (!cities?.length) return [primary];
  const base = stripLocationFromQuery(primary);
  if (!base) return [primary];
  return cities.map((city) => appendLocationCityToQuery(base, city));
}

/**
 * 对单条「已含 location 等」的 q 做 followers / repos 维度的自动分桶（互斥区间）。
 * - 无 followers 且无 repos：followers 四档 + repos 四档（共 8 条，扩大池子）。
 * - 仅有 followers：追加 repos 四档。
 * - 仅有 repos：追加 followers 四档。
 * - 两者皆有：不再自动分桶。
 */
export function expandDimensionBucketsForQuery(pv: string): string[] {
  const hasF = githubUserQueryHasFollowersQualifier(pv);
  const hasR = githubUserQueryHasReposQualifier(pv);
  if (!hasF && !hasR) {
    return [...buildFollowerBucketGithubQueries(pv), ...buildReposBucketGithubQueries(pv)];
  }
  if (hasF && !hasR) {
    return buildReposBucketGithubQueries(pv);
  }
  if (!hasF && hasR) {
    return buildFollowerBucketGithubQueries(pv);
  }
  return [pv];
}

function uniqGithubQueries(arr: string[]): string[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = norm(x);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

/**
 * 展开为多条实际搜索用 `githubQuery`（去重、限条数）。
 * - LLM 返回去重后 ≥2 条（主 + shardQueries）时：优先采用，最多 6 条。
 * - 否则：大国/大区 location → 多城市；再叠 followers/repos 分桶（总条数 capped）。
 */
export function expandGithubSearchQueries(parsed: ParsedQuery): string[] {
  const primary = parsed.githubQuery.trim();
  const raw = parsed.shardQueries;
  const llmShards = Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 5)
    : [];

  const combined = uniqGithubQueries([primary, ...llmShards]);
  if (combined.length >= 2) {
    return combined.slice(0, 6);
  }

  const locVariants = expandBroadLocationVariants(primary);

  if (locVariants.length > 1) {
    const flat: string[] = [];
    for (const pv of locVariants) {
      const hasF = githubUserQueryHasFollowersQualifier(pv);
      const hasR = githubUserQueryHasReposQualifier(pv);
      if (!hasF && !hasR) {
        flat.push(
          appendQualifierSuffix(pv, 'followers:1..500'),
          appendQualifierSuffix(pv, 'followers:501..5000'),
          appendQualifierSuffix(pv, 'repos:1..25'),
          appendQualifierSuffix(pv, 'repos:26..150'),
        );
      } else if (hasF && !hasR) {
        flat.push(...buildReposBucketGithubQueries(pv).slice(0, 3));
      } else if (!hasF && hasR) {
        flat.push(...buildFollowerBucketGithubQueries(pv).slice(0, 3));
      } else {
        flat.push(pv);
      }
    }
    return uniqGithubQueries(flat).slice(0, GITHUB_SEARCH_AUTO_QUERY_CAP);
  }

  const pv = locVariants[0] ?? primary;
  return uniqGithubQueries(expandDimensionBucketsForQuery(pv)).slice(0, GITHUB_SEARCH_AUTO_QUERY_CAP);
}

export async function parseQueryToGitHubSearch(query: string): Promise<ParsedQuery> {
  const { model } = getPublishingLlmClient();

  const prompt = `你是 GitHub Search API 查询生成器。将用户的自然语言需求转换为 GitHub Search Users API 的 q 参数。

用户需求（可能同时包含自然语言与 JD/附件正文，请综合提炼检索条件）：
${query}

GitHub Search Users 支持的 qualifier：
- language:xxx（编程语言，如 language:rust）
- location:xxx（地点，如 location:shanghai、location:china）
- followers:>N 或 followers:N..M（粉丝数）
- repos:>N（仓库数）
- type:user（排除组织）
- 自由文本关键词（如 fullstack、machine-learning）

输出**仅一个 JSON 对象**：
{
  "githubQuery": "language:rust location:china type:user",
  "sort": "followers",
  "order": "desc",
  "explanation": "搜索在中国的 Rust 开发者，按粉丝数排序",
  "shardQueries": ["language:rust location:china type:user followers:1..800", "language:rust location:china type:user followers:801..20000"]
}

规则：
- githubQuery 必须是有效的 GitHub search users q 参数
- sort 可选值: "followers", "repositories", "joined"，或不填（默认 best-match）
- 尽量添加 type:user 排除组织账号
- 如果用户提到了具体技术栈，用 language: qualifier
- 如果用户提到了地区，用 location: qualifier
- 如果用户强调经验丰富/资深，加 followers:>100 或 repos:>30
- 关键词尽量用英文（GitHub 数据以英文为主）
- **shardQueries（可选）**：GitHub Search Users 单次最多返回约 1000 条。若主查询较宽、可能命中大量用户，请额外输出 1–4 条**完整**的 alternate githubQuery，与主查询用**互斥的** followers:N..M 或 repos:N..M 分档，便于系统合并去重后覆盖更广。每条须含 type:user 且与主查询意图一致。若已在 githubQuery 中写了 followers: 限定，可省略 shardQueries。
- 服务端还会对**无 LLM 分片**时的查询自动做 **followers/repos 分桶**；对 **location:china、USA、India** 等国家/大区词自动拆成多城市分片。若你已在 githubQuery 中精确到城市，无需再写 shardQueries。
- 不要在 githubQuery 与 shardQueries 里重复完全相同的字符串。`;

  const response = await trackedChatCompletion(
    { model, messages: [{ role: 'user', content: prompt }], max_tokens: 520, temperature: 0.2 },
    'developer_search',
  );

  const raw = response.choices[0]?.message?.content?.trim() || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { githubQuery: `${query} type:user`, explanation: 'Direct keyword search' };
  }

  try {
    const rawObj = JSON.parse(jsonMatch[0]) as ParsedQuery & { shardQueries?: unknown };
    if (!rawObj.githubQuery) throw new Error('missing githubQuery');
    const parsed: ParsedQuery = {
      githubQuery: String(rawObj.githubQuery).trim(),
      sort: rawObj.sort,
      order: rawObj.order,
      explanation: String(rawObj.explanation || '').trim() || 'Parsed search',
    };
    if (Array.isArray(rawObj.shardQueries)) {
      const shards = rawObj.shardQueries
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, 5);
      if (shards.length) parsed.shardQueries = shards;
    }
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

/** 合并多路 Search users 结果，同一 login 保留 followers 更高的一条（若无则后者覆盖）。 */
export function mergeGitHubUserSearchItems<T extends { login: string; followers?: number }>(batches: T[][]): T[] {
  const m = new Map<string, T>();
  for (const batch of batches) {
    for (const u of batch) {
      if (!u?.login) continue;
      const k = u.login.toLowerCase();
      const prev = m.get(k);
      if (!prev || (Number(u.followers) || 0) > (Number(prev.followers) || 0)) {
        m.set(k, u);
      }
    }
  }
  return [...m.values()];
}

function looksLikePublicContactBlogOrSocial(s: string): boolean {
  const t = s.trim();
  if (t.length < 3 || /^(none|n\/a|false|no)$/i.test(t)) return false;
  if (t.includes('@') && /\.\w{2,}/.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/[\w.-]+\.(com|io|dev|net|org|me|app|co|cn|ai)\b/i.test(t)) return true;
  return false;
}

function hasPublicContactInfo(user: GHSearchUserItem, crawl?: GitHubCrawlResult): boolean {
  const email = (crawl?.email ?? (user as { email?: string | null }).email ?? '').trim();
  const blog = (crawl?.blog ?? user.blog ?? '').trim();
  const twitter = (crawl?.twitterUsername ?? (user as { twitter_username?: string | null }).twitter_username ?? '').trim();
  if (email && email.includes('@')) return true;
  if (blog && looksLikePublicContactBlogOrSocial(blog)) return true;
  if (twitter.length > 0) return true;
  return false;
}

function assignLinkBucket(hasJob: boolean, hasContact: boolean): LinkSearchBucketKey {
  if (hasJob && hasContact) return 'jobSeekingAndContact';
  if (hasJob) return 'jobSeekingOnly';
  if (hasContact) return 'contactOnly';
  return 'neither';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

  const users = data.items
    .filter((u) => !u.type || String(u.type).toLowerCase() === 'user')
    .slice(0, perPage);
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

async function fetchGitHubSearchUsersSinglePage(
  parsedQuery: ParsedQuery,
  token: string | undefined,
  page: number,
  perPage: number,
): Promise<GHSearchUserItem[]> {
  const params = new URLSearchParams({
    q: parsedQuery.githubQuery,
    per_page: String(perPage),
    page: String(page),
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
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub Search API ${res.status}: ${text.slice(0, 160)}`);
  }
  const data = (await res.json()) as GHSearchResponse;
  return data.items
    .filter((u) => !u.type || String(u.type).toLowerCase() === 'user')
    .slice(0, perPage);
}

/** 单条 q 下分页拉取，单 q 在 GitHub 侧最多约 1000 条可访问结果 */
async function fetchGitHubSearchShardAllPages(
  sliceParsed: ParsedQuery,
  token: string | undefined,
): Promise<GHSearchUserItem[]> {
  const perPage = 100;
  const maxPages = 10;
  const acc: GHSearchUserItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    let rows: GHSearchUserItem[];
    try {
      rows = await fetchGitHubSearchUsersSinglePage(sliceParsed, token, page, perPage);
    } catch (e) {
      if (page === 1) throw e;
      console.warn(`[CodernetSearch] shard page ${page} stop:`, e);
      break;
    }
    if (!rows.length) break;
    acc.push(...rows);
    if (rows.length < perPage) break;
  }
  return acc;
}

async function searchGitHubUsers(parsedQuery: ParsedQuery, token?: string): Promise<GHSearchUserItem[]> {
  const maxMerged = getLinkSearchMaxMerged();
  const queries = expandGithubSearchQueries(parsedQuery);
  const batches: GHSearchUserItem[][] = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const sliceParsed: ParsedQuery = { ...parsedQuery, githubQuery: q };
    try {
      const rows = await fetchGitHubSearchShardAllPages(sliceParsed, token);
      batches.push(rows);
      console.log(`[CodernetSearch] shard ${i + 1}/${queries.length} got ${rows.length} users`);
    } catch (e) {
      console.warn(`[CodernetSearch] shard ${i + 1}/${queries.length} failed q=${q.slice(0, 100)}`, e);
    }
    if (i < queries.length - 1) await sleep(120);
  }

  const merged = mergeGitHubUserSearchItems(batches);
  merged.sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0));
  const top = merged.slice(0, maxMerged);

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const profiled = await Promise.allSettled(
    top.map(async (u) => {
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

  return profiled
    .filter((r): r is PromiseFulfilledResult<GHSearchUserItem> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/* ── Phase 3: 批量爬取 + AI 分析（lightweight，只对 top 5）── */

interface EnrichedCandidate {
  user: GHSearchUserItem;
  crawl?: GitHubCrawlResult;
  analysis?: CodernetAnalysis;
}

async function enrichOneCandidate(
  user: GHSearchUserItem,
  token?: string,
  lookupCache?: Map<string, any>,
): Promise<EnrichedCandidate> {
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
}

async function enrichCandidates(
  users: GHSearchUserItem[],
  token?: string,
  lookupCache?: Map<string, any>,
  onChunk?: (done: number, total: number) => void,
): Promise<EnrichedCandidate[]> {
  const conc = getEnrichConcurrency();
  const out: EnrichedCandidate[] = [];
  for (let i = 0; i < users.length; i += conc) {
    const slice = users.slice(i, i + conc);
    const settled = await Promise.allSettled(slice.map((u) => enrichOneCandidate(u, token, lookupCache)));
    for (const s of settled) {
      if (s.status === 'fulfilled') out.push(s.value);
    }
    onChunk?.(out.length, users.length);
  }
  return out;
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
- 最多返回 24 条，只返回 score >= 0.3 的
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
  /** 路由层定时保活：长时间无真实进度时写出，避免反代/浏览器空闲断流 */
  keepalive?: boolean;
}

const RERANK_POOL = 24;

function fallbackScoreFromFollowers(followers: number): number {
  const f = Math.min(500_000, Math.max(0, followers));
  return Math.round((0.32 + (Math.log10(f + 10) / Math.log10(500_010)) * 0.16) * 1000) / 1000;
}

export async function searchDevelopers(
  query: string,
  lookupCache: Map<string, any>,
  token?: string,
  onProgress?: (p: SearchProgress) => void,
): Promise<SearchDevelopersResponse> {
  const emptyBuckets = (): LinkSearchBuckets => ({
    jobSeekingAndContact: [],
    jobSeekingOnly: [],
    contactOnly: [],
    neither: [],
  });

  onProgress?.({ phase: 'parsing', detail: '正在理解您的检索需求并生成 GitHub 检索策略…' });

  const parsed = await parseQueryToGitHubSearch(query);
  console.log(`[CodernetSearch] parsed: "${parsed.githubQuery}" (${parsed.explanation})`);

  const shardQs = expandGithubSearchQueries(parsed);
  onProgress?.({
    phase: 'searching',
    detail:
      shardQs.length > 1
        ? `正在检索 GitHub（${shardQs.length} 条查询，分页合并，单路最多约 1000 条）…`
        : `正在检索 GitHub：${parsed.githubQuery}`,
    githubQuery: parsed.githubQuery,
  });

  const ghUsers = await searchGitHubUsers(parsed, token);
  if (ghUsers.length === 0) {
    onProgress?.({ phase: 'done', detail: '未在 GitHub 上找到符合条件的用户', totalFound: 0 });
    const buckets = emptyBuckets();
    return { results: [], buckets, meta: { mergedGithubCount: 0, enrichedCount: 0 } };
  }

  onProgress?.({
    phase: 'enriching',
    detail: `正在爬取与分析 ${ghUsers.length} 位候选人的公开资料（并发 ${getEnrichConcurrency()}）…`,
    totalFound: ghUsers.length,
  });

  const enriched = await enrichCandidates(ghUsers, token, lookupCache, (done, total) => {
    onProgress?.({
      phase: 'enriching',
      detail: `画像进度 ${done}/${total}（并发 ${getEnrichConcurrency()}）…`,
      totalFound: ghUsers.length,
    });
  });

  const JOB_SIGNAL_BATCH = 6;
  const jobAndContactMeta: Array<{ hasJob: boolean; hasContact: boolean; bucket: LinkSearchBucketKey }> = [];
  for (let j = 0; j < enriched.length; j += JOB_SIGNAL_BATCH) {
    const slice = enriched.slice(j, j + JOB_SIGNAL_BATCH);
    const part = await Promise.all(
      slice.map(async (c) => {
        const hasContact = hasPublicContactInfo(c.user, c.crawl);
        let hasJob = false;
        if (c.crawl) {
          const sigs = await collectJobSeekingSignals(c.crawl, token);
          hasJob = sigs.length > 0;
        } else if (c.user.bio && textLooksJobSeeking(c.user.bio)) {
          hasJob = true;
        }
        return { hasJob, hasContact, bucket: assignLinkBucket(hasJob, hasContact) };
      }),
    );
    jobAndContactMeta.push(...part);
  }

  onProgress?.({ phase: 'ranking', detail: '正在用 AI 精排（子集）并生成分类结果…' });

  const rerankPool = enriched.slice(0, Math.min(RERANK_POOL, enriched.length));
  const ranked = await rerankCandidates(query, rerankPool);
  const scoreMap = new Map<number, { score: number; reason: string }>();
  for (const r of ranked) {
    if (r.score >= 0.3 && r.index >= 0 && r.index < rerankPool.length) {
      const gIdx = r.index;
      const prev = scoreMap.get(gIdx);
      if (!prev || r.score > prev.score) scoreMap.set(gIdx, { score: r.score, reason: r.reason });
    }
  }

  function buildRow(globalIdx: number, c: EnrichedCandidate): DeveloperSearchResult {
    const u = c.user;
    const followers = u.followers ?? c.crawl?.followers ?? 0;
    const sr = scoreMap.get(globalIdx);
    const score = sr?.score ?? fallbackScoreFromFollowers(followers);
    const reason = sr?.reason || 'GitHub 检索命中（未进入精排子集时按公开影响力估算）';
    const meta = jobAndContactMeta[globalIdx]!;
    return {
      githubUsername: c.user.login,
      avatarUrl: c.user.avatar_url,
      oneLiner: c.analysis?.oneLiner || '',
      techTags: c.analysis?.techTags || [],
      sharpCommentary: c.analysis?.sharpCommentary || '',
      score,
      reason,
      source: 'github_search' as const,
      stats: {
        totalPublicRepos: c.user.public_repos ?? c.crawl?.totalPublicRepos ?? 0,
        totalStars: c.crawl?.totalStars ?? 0,
        followers,
      },
      bio: c.user.bio ?? c.crawl?.bio ?? null,
      location: c.user.location ?? c.crawl?.location ?? null,
      capabilityQuadrant: c.analysis?.capabilityQuadrant,
      hasJobSeekingIntent: meta.hasJob,
      hasContact: meta.hasContact,
      linkBucket: meta.bucket,
    };
  }

  const buckets = emptyBuckets();

  const byIdx = enriched.map((c, globalIdx) => ({ c, globalIdx }));
  byIdx.sort((a, b) => {
    const sa = scoreMap.get(a.globalIdx)?.score ?? fallbackScoreFromFollowers(a.c.user.followers ?? 0);
    const sb = scoreMap.get(b.globalIdx)?.score ?? fallbackScoreFromFollowers(b.c.user.followers ?? 0);
    return sb - sa;
  });

  for (const { c, globalIdx } of byIdx) {
    const row = buildRow(globalIdx, c);
    buckets[row.linkBucket!].push(row);
  }

  const results: DeveloperSearchResult[] = [
    ...buckets.jobSeekingAndContact,
    ...buckets.jobSeekingOnly,
    ...buckets.contactOnly,
    ...buckets.neither,
  ];

  onProgress?.({
    phase: 'done',
    detail: `完成：合并 ${ghUsers.length} 人 → 全量分析 ${enriched.length} 人；分桶 ①${buckets.jobSeekingAndContact.length} ②${buckets.jobSeekingOnly.length} ③${buckets.contactOnly.length} ④${buckets.neither.length}`,
    totalFound: enriched.length,
  });

  return {
    results,
    buckets,
    meta: { mergedGithubCount: ghUsers.length, enrichedCount: enriched.length },
  };
}
