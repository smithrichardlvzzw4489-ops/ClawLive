/**
 * Codernet 全网开发者搜索：
 * 1. LLM 解析自然语言 → GitHub Search API qualifiers
 * 2. GitHub Search API 实时搜人（/search/users；分片合并，缓解单次约 1000 条上限）
 * 3. 每条 /users/:login 公开摘要（bio / blog / 粉丝等），不做仓库级深度爬取与 AI 画像
 * 4. 核心：按求职文案 + 公开联系方式分为四类人输出（桶内按粉丝数排序）；默认不对合并人数截断（可选环境变量上限），不做 LLM 精排
 */

import { getPublishingLlmClient, trackedChatCompletion } from './llm';
import { type GitHubCrawlResult } from './github-crawler';
import type { CodernetAnalysis } from './codernet-profile-analyzer';
import { textLooksJobSeeking } from './job-seeking-signals';

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
  meta: {
    mergedGithubCount: number;
    /** 参与分桶与返回的人数（当前均为公开元数据，无深度画像） */
    enrichedCount: number;
    /** 深度爬取 + AI 画像人数（当前流水线恒为 0） */
    deepEnrichCount: number;
    /** 仅公开摘要、未做深度爬取的人数（当前与 enrichedCount 相同） */
    metadataOnlyCount: number;
  };
}

/**
 * 默认返回 null：合并去重后的候选人**全部**进入四类分桶与 `/users/:login` 补全（无站内人数上限）。
 * 若显式设置 `LINK_SEARCH_MAX_MERGED_CANDIDATES` 为正整数，则仅截取前 N 人（供运营/限流应急）。
 */
function getLinkSearchMaxMergedCap(): number | null {
  const raw = process.env.LINK_SEARCH_MAX_MERGED_CANDIDATES;
  if (raw === undefined || String(raw).trim() === '') return null;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(2_000_000, Math.max(1, n));
}

/** LINK 结果列表顺序：四类人依次输出 */
const LINK_BUCKET_OUTPUT_ORDER: LinkSearchBucketKey[] = [
  'jobSeekingAndContact',
  'jobSeekingOnly',
  'contactOnly',
  'neither',
];

/* ── Phase 1: LLM 解析用户意图 → GitHub Search qualifiers ─── */

export interface ParsedQuery {
  githubQuery: string;
  sort?: 'followers' | 'repositories' | 'joined';
  order?: 'desc' | 'asc';
  explanation: string;
  /**
   * 可选：多条完整 GitHub `q`（每条均须合法）。服务端**始终**再叠一层固定规则的自动分片；
   * LLM 分片与主查询合并去重后截取前 `GITHUB_SEARCH_AUTO_QUERY_CAP` 条，保证覆盖面大且顺序稳定。
   */
  shardQueries?: string[];
}

/** 自动分片生成的 q 条数上限（Search API 调用条数；提高可扩大合并池，注意速率限制）。 */
export const GITHUB_SEARCH_AUTO_QUERY_CAP = 18;

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
 * 仅由主查询 `githubQuery` 按固定规则展开（大国拆市 + followers/repos 分桶）；不含 LLM shard，顺序稳定。
 */
export function expandGithubQueriesAutoFromPrimary(primaryGithubQuery: string): string[] {
  const primary = primaryGithubQuery.trim();
  if (!primary) return [];

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
    return uniqGithubQueries(flat);
  }

  const pv = locVariants[0] ?? primary;
  return uniqGithubQueries(expandDimensionBucketsForQuery(pv));
}

/**
 * 展开为多条实际搜索用 `q`：先取**自动分片**（稳定、覆盖面大），再并入主查询与 LLM `shardQueries`，去重后截断。
 * 不再因「LLM 给了 shard」而跳过自动分桶，避免同一句自然语言两次检索人数差一个数量级。
 */
export function expandGithubSearchQueries(parsed: ParsedQuery): string[] {
  const primary = parsed.githubQuery.trim();
  const raw = parsed.shardQueries;
  const llmShards = Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 5)
    : [];

  const autoExpanded = expandGithubQueriesAutoFromPrimary(primary);
  return uniqGithubQueries([...autoExpanded, primary, ...llmShards]).slice(0, GITHUB_SEARCH_AUTO_QUERY_CAP);
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
- **shardQueries（可选）**：服务端会**固定**对主查询做 followers/repos 分桶与国家/大区拆市；你可额外提供 1–4 条与主意图一致的 alternate 搜索串（互斥 followers/repos 档更佳），会与自动分片**合并去重**后选用，用于补洞或强调某一分档。若已在 githubQuery 中写了完整分档，可省略 shardQueries。
- 对 **location:china、USA、India** 等国家/大区词可写大区或精确到城市；服务端仍会按规则展开。
- 不要在 githubQuery 与 shardQueries 里重复完全相同的字符串。`;

  const response = await trackedChatCompletion(
    { model, messages: [{ role: 'user', content: prompt }], max_tokens: 520, temperature: 0 },
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

type PipelineDiagLog = (phase: string, extra?: Record<string, unknown>) => void;

async function searchGitHubUsers(
  parsedQuery: ParsedQuery,
  token?: string,
  pipeLog?: PipelineDiagLog,
): Promise<GHSearchUserItem[]> {
  const mergedCap = getLinkSearchMaxMergedCap();
  const queries = expandGithubSearchQueries(parsedQuery);
  const batches: GHSearchUserItem[][] = [];

  pipeLog?.('github_search_shards', {
    shardTotal: queries.length,
    mergedCap: mergedCap ?? 'none',
  });

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const sliceParsed: ParsedQuery = { ...parsedQuery, githubQuery: q };
    const tShard = Date.now();
    try {
      const rows = await fetchGitHubSearchShardAllPages(sliceParsed, token);
      batches.push(rows);
      console.log(`[CodernetSearch] shard ${i + 1}/${queries.length} got ${rows.length} users`);
      pipeLog?.('github_shard_ok', {
        shardIndex: i + 1,
        shardTotal: queries.length,
        rowCount: rows.length,
        shardElapsedMs: Date.now() - tShard,
        qPreview: q.slice(0, 96),
      });
    } catch (e) {
      console.warn(`[CodernetSearch] shard ${i + 1}/${queries.length} failed q=${q.slice(0, 100)}`, e);
      pipeLog?.('github_shard_error', {
        shardIndex: i + 1,
        shardTotal: queries.length,
        shardElapsedMs: Date.now() - tShard,
        qPreview: q.slice(0, 96),
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (i < queries.length - 1) await sleep(120);
  }

  const merged = mergeGitHubUserSearchItems(batches);
  merged.sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0));
  const top = mergedCap == null ? merged : merged.slice(0, mergedCap);

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ClawLab-Codernet/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const tProf = Date.now();
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

  pipeLog?.('github_profile_enrich_ok', {
    profileFetchCount: top.length,
    profileEnrichElapsedMs: Date.now() - tProf,
  });

  return profiled
    .filter((r): r is PromiseFulfilledResult<GHSearchUserItem> => r.status === 'fulfilled')
    .map((r) => r.value);
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

function fallbackScoreFromFollowers(followers: number): number {
  const f = Math.min(500_000, Math.max(0, followers));
  return Math.round((0.32 + (Math.log10(f + 10) / Math.log10(500_010)) * 0.16) * 1000) / 1000;
}

/** 与 `[GITLINK] linkSearch` 的 `requestId` 对齐，便于检索流水线分阶段耗时。 */
export interface SearchDevelopersDiagContext {
  requestId: string;
}

export async function searchDevelopers(
  query: string,
  lookupCache: Map<string, any>,
  token?: string,
  onProgress?: (p: SearchProgress) => void,
  diag?: SearchDevelopersDiagContext,
): Promise<SearchDevelopersResponse> {
  const rid = diag?.requestId?.trim() || null;
  const tPipe0 = Date.now();
  const pipeLog = (phase: string, extra?: Record<string, unknown>) => {
    console.log(
      '[GITLINK] linkSearchPipeline',
      JSON.stringify({
        requestId: rid,
        phase,
        pipelineElapsedMs: Date.now() - tPipe0,
        ...extra,
      }),
    );
  };

  const emptyBuckets = (): LinkSearchBuckets => ({
    jobSeekingAndContact: [],
    jobSeekingOnly: [],
    contactOnly: [],
    neither: [],
  });

  try {
  void lookupCache;

  onProgress?.({ phase: 'parsing', detail: '正在理解您的检索需求并生成 GitHub 检索策略…' });

  pipeLog('pipeline_enter', { queryChars: query.length });

  const tParse = Date.now();
  pipeLog('parse_llm_enter');
  const parsed = await parseQueryToGitHubSearch(query);
  pipeLog('parse_llm_ok', {
    parseElapsedMs: Date.now() - tParse,
    githubQueryLen: parsed.githubQuery.length,
    explanationLen: (parsed.explanation || '').length,
    hasShardQueries: Boolean(parsed.shardQueries?.length),
  });
  console.log(`[CodernetSearch] parsed: "${parsed.githubQuery}" (${parsed.explanation})`);

  const shardQs = expandGithubSearchQueries(parsed);
  pipeLog('github_queries_expanded', {
    expandedShardCount: shardQs.length,
    primaryGithubQueryPreview: parsed.githubQuery.slice(0, 120),
  });
  onProgress?.({
    phase: 'searching',
    detail:
      shardQs.length > 1
        ? `正在检索 GitHub（${shardQs.length} 条查询，分页合并，单路最多约 1000 条）…`
        : `正在检索 GitHub：${parsed.githubQuery}`,
    githubQuery: parsed.githubQuery,
  });

  const tGh = Date.now();
  pipeLog('github_search_enter');
  const ghUsers = await searchGitHubUsers(parsed, token, pipeLog);
  pipeLog('github_search_ok', {
    githubSearchElapsedMs: Date.now() - tGh,
    mergedGithubCount: ghUsers.length,
  });
  if (ghUsers.length === 0) {
    onProgress?.({ phase: 'done', detail: '未在 GitHub 上找到符合条件的用户', totalFound: 0 });
    const buckets = emptyBuckets();
    pipeLog('pipeline_ok_empty_github', { totalElapsedMs: Date.now() - tPipe0 });
    return {
      results: [],
      buckets,
      meta: { mergedGithubCount: 0, enrichedCount: 0, deepEnrichCount: 0, metadataOnlyCount: 0 },
    };
  }

  onProgress?.({
    phase: 'ranking',
    detail: `合并 ${ghUsers.length} 人，按公开 bio / 联系方式分为四类…`,
    totalFound: ghUsers.length,
  });

  const tBucket = Date.now();
  const jobAndContactMeta = ghUsers.map((u) => {
    const hasContact = hasPublicContactInfo(u);
    const hasJob = Boolean(u.bio && textLooksJobSeeking(u.bio));
    return { hasJob, hasContact, bucket: assignLinkBucket(hasJob, hasContact) };
  });

  const idxByBucket: Record<LinkSearchBucketKey, number[]> = {
    jobSeekingAndContact: [],
    jobSeekingOnly: [],
    contactOnly: [],
    neither: [],
  };
  for (let i = 0; i < ghUsers.length; i++) {
    idxByBucket[jobAndContactMeta[i]!.bucket].push(i);
  }
  for (const bk of LINK_BUCKET_OUTPUT_ORDER) {
    idxByBucket[bk].sort(
      (ia, ib) => (Number(ghUsers[ib]!.followers) || 0) - (Number(ghUsers[ia]!.followers) || 0),
    );
  }

  function buildPublicMetadataRow(globalIdx: number): DeveloperSearchResult {
    const u = ghUsers[globalIdx]!;
    const meta = jobAndContactMeta[globalIdx]!;
    const followers = u.followers ?? 0;
    return {
      githubUsername: u.login,
      avatarUrl: u.avatar_url,
      oneLiner: '',
      techTags: [],
      sharpCommentary: '',
      score: fallbackScoreFromFollowers(followers),
      reason: 'GitHub 公开检索命中（按四类分桶；未做深度画像与精排）',
      source: 'github_search' as const,
      stats: {
        totalPublicRepos: u.public_repos ?? 0,
        totalStars: 0,
        followers,
      },
      bio: u.bio ?? null,
      location: u.location ?? null,
      hasJobSeekingIntent: meta.hasJob,
      hasContact: meta.hasContact,
      linkBucket: meta.bucket,
    };
  }

  const buckets = emptyBuckets();
  const results: DeveloperSearchResult[] = [];
  for (const bk of LINK_BUCKET_OUTPUT_ORDER) {
    for (const idx of idxByBucket[bk]) {
      const row = buildPublicMetadataRow(idx);
      buckets[bk].push(row);
      results.push(row);
    }
  }

  pipeLog('bucket_only_ok', {
    bucketElapsedMs: Date.now() - tBucket,
    mergedGithubCount: ghUsers.length,
    bucket1: buckets.jobSeekingAndContact.length,
    bucket2: buckets.jobSeekingOnly.length,
    bucket3: buckets.contactOnly.length,
    bucket4: buckets.neither.length,
  });

  onProgress?.({
    phase: 'done',
    detail: `完成：合并 ${ghUsers.length} 人；按四类依次输出 ①求职+联系方式 ${buckets.jobSeekingAndContact.length} ②仅求职 ${buckets.jobSeekingOnly.length} ③仅联系方式 ${buckets.contactOnly.length} ④其他 ${buckets.neither.length}（桶内按粉丝数）`,
    totalFound: ghUsers.length,
  });

  pipeLog('pipeline_ok', {
    totalElapsedMs: Date.now() - tPipe0,
    resultCount: results.length,
    mergedGithubCount: ghUsers.length,
    enrichedCount: ghUsers.length,
  });

  return {
    results,
    buckets,
    meta: {
      mergedGithubCount: ghUsers.length,
      enrichedCount: ghUsers.length,
      deepEnrichCount: 0,
      metadataOnlyCount: ghUsers.length,
    },
  };
  } catch (e) {
    pipeLog('pipeline_throw', {
      totalElapsedMs: Date.now() - tPipe0,
      message: e instanceof Error ? e.message : String(e),
      stackTop: e instanceof Error ? (e.stack || '').split('\n').slice(0, 3).join(' | ') : undefined,
    });
    throw e;
  }
}
