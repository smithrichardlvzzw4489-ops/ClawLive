/**
 * GitHub 画像页侧边能力：相似用户（LLM→GitHub Search + 多档兜底）、关系（贡献者 + 关注兜底）。
 */

import type { GitHubCrawlResult, GHRepo } from './github-crawler';
import type { CodernetAnalysis } from './codernet-profile-analyzer';
import {
  parseQueryToGitHubSearch,
  runGitHubUserSearchFromParsed,
  type ParsedQuery,
  type GHSearchUserItem,
} from './codernet-search';
import { getPublishingLlmClient, trackedChatCompletion } from './llm';

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
  /** 一句中文技术画像短评（主画像「锐评」风格，基于公开 GitHub 字段生成） */
  summary: string;
};

export type RelationPersonRow = {
  githubUsername: string;
  avatarUrl: string;
  connectionDensity: number;
  rawWeight: number;
  summary: string;
};

/** GitHub GET /users/:login 中用于侧栏一句话的公开字段 */
export type GHUserPublicBlurb = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  public_repos: number;
};

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      if (cursor >= items.length) return;
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, runWorker));
  return results;
}

async function fetchGitHubUserPublic(login: string, token: string | undefined): Promise<GHUserPublicBlurb | null> {
  try {
    const res = await fetch(`${GH_API}/users/${encodeURIComponent(login)}`, { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const lo = typeof j.login === 'string' ? j.login : login;
    return {
      login: lo,
      name: typeof j.name === 'string' ? j.name : null,
      bio: typeof j.bio === 'string' ? j.bio : null,
      company: typeof j.company === 'string' ? j.company : null,
      location: typeof j.location === 'string' ? j.location : null,
      followers: typeof j.followers === 'number' ? j.followers : 0,
      public_repos: typeof j.public_repos === 'number' ? j.public_repos : 0,
    };
  } catch {
    return null;
  }
}

function compactBlurbLine(login: string, card: GHUserPublicBlurb | null): string {
  const bio = (card?.bio || '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  const name = (card?.name || '').replace(/\|/g, ' ').trim().slice(0, 48);
  const company = (card?.company || '').replace(/\|/g, ' ').trim().slice(0, 48);
  const loc = (card?.location || '').replace(/\|/g, ' ').trim().slice(0, 48);
  const f = card?.followers ?? 0;
  const r = card?.public_repos ?? 0;
  return `${login.toLowerCase()}|${name}|${bio}|${company}|${loc}|${f}|${r}`;
}

function buildFallbackSummary(card: GHUserPublicBlurb | null, login: string): string {
  if (card?.bio?.trim()) return card.bio.trim().slice(0, 120);
  const f = card?.followers ?? 0;
  const r = card?.public_repos ?? 0;
  if (f > 2000 || r > 40) {
    return `@${login} 在 GitHub 上公开活跃度很高（约 ${f.toLocaleString()} 关注者、${r} 个公开仓库），多为社区可见的工程向账号。`;
  }
  if (f > 200 || r > 15) {
    return `@${login} 有一定公开工程痕迹（约 ${f.toLocaleString()} 关注者、${r} 个公开仓库）。`;
  }
  return `@${login} 的 GitHub 公开资料偏少，多为协同或小众仓库参与。`;
}

async function synthesizeSummariesWithLlm(
  logins: string[],
  getCard: (login: string) => GHUserPublicBlurb | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (logins.length === 0) return out;
  const { model } = getPublishingLlmClient();
  const chunkSize = 26;
  for (let i = 0; i < logins.length; i += chunkSize) {
    try {
    const chunk = logins.slice(i, i + chunkSize);
    const lines = chunk.map((login) => compactBlurbLine(login, getCard(login)));
    const prompt = `你是 GITLINK 侧栏文案：根据下列 GitHub 用户的公开字段，为每人写一句中文「技术画像」短评。
风格：略带机智与数据感，类似科技媒体一句话点名其气质或长板；20–55 个汉字；不用引号包裹整句；不要编造具体项目名或公司内幕；bio 为空时可结合粉丝数与仓库数写泛化但不过分夸张的评价。

每行格式：login|name|bio片段|company|location|followers|public_repos

${lines.join('\n')}

仅输出一个 JSON 对象，形如：{"items":[{"login":"小写","summary":"一句中文"}]}
必须覆盖以上每一位 login（小写），不要遗漏，不要额外键。`;

    const response = await trackedChatCompletion(
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3600,
        temperature: 0.5,
      },
      'github_graph_blurb',
    );
    const raw = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) continue;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { items?: Array<{ login?: string; summary?: string }> };
      for (const it of parsed.items || []) {
        const lo = it.login?.trim().toLowerCase();
        const s = it.summary?.trim();
        if (lo && s) out.set(lo, s.slice(0, 160));
      }
    } catch {
      /* ignore chunk parse */
    }
    } catch (e) {
      console.warn('[GitHubProfileGraph] summary LLM chunk failed:', e instanceof Error ? e.message : e);
    }
  }
  return out;
}

async function enrichPeopleWithSummaries<T extends { githubUsername: string }>(
  rows: T[],
  token: string | undefined,
): Promise<Array<T & { summary: string }>> {
  if (rows.length === 0) return [];
  const logins = [...new Set(rows.map((r) => r.githubUsername))];
  const cards = await mapPool(logins, 8, (login) => fetchGitHubUserPublic(login, token));
  const cardByLogin = new Map<string, GHUserPublicBlurb | null>();
  logins.forEach((login, idx) => cardByLogin.set(login.toLowerCase(), cards[idx]));

  let llmMap = new Map<string, string>();
  try {
    llmMap = await synthesizeSummariesWithLlm(logins, (login) => cardByLogin.get(login.toLowerCase()) ?? null);
  } catch (e) {
    console.warn('[GitHubProfileGraph] LLM summaries skipped:', e instanceof Error ? e.message : e);
  }

  return rows.map((r) => {
    const key = r.githubUsername.toLowerCase();
    const card = cardByLogin.get(key) ?? null;
    const summary = (llmMap.get(key) || '').trim() || buildFallbackSummary(card, r.githubUsername);
    return { ...r, summary };
  });
}

function ghLangForSearch(display: string): string {
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
    '请综合以上信息构造一条 GitHub Search Users 的 q：兼顾主要语言、合理粉丝/仓库量级、与领域相关的英文关键词。',
  );
  lines.push(
    '【硬性规则】若 githubQuery 中出现多个 language: 条件，必须用括号 + OR 写成 (language:rust OR language:c)，禁止写成空格分隔的多个 language:（GitHub 会当成 AND，结果常为空）。',
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

/** LLM 结果为空或过严时的多档兜底（显式 OR 语言、粉丝带、宽 repos） */
function buildSimilarFallbackQueries(seed: string, crawl: GitHubCrawlResult, analysis?: CodernetAnalysis): ParsedQuery[] {
  const out: ParsedQuery[] = [];
  const langs: string[] = [];
  if (analysis?.languageDistribution?.length) {
    for (const l of analysis.languageDistribution) {
      if (l.percent >= 1.5 && l.language) langs.push(ghLangForSearch(l.language));
    }
  }
  if (langs.length === 0 && crawl.languageStats) {
    for (const [name, bytes] of Object.entries(crawl.languageStats).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      if (bytes > 0) langs.push(ghLangForSearch(name));
    }
  }
  const uniq = [...new Set(langs)].filter(Boolean).slice(0, 4);
  if (uniq.length >= 1) {
    const orq = uniq.map((g) => `language:${g}`).join(' OR ');
    out.push({ githubQuery: `(${orq}) type:user -user:${seed}`, explanation: 'fallback-lang-or' });
  }
  const f = crawl.followers || 0;
  if (f > 200_000) {
    out.push({
      githubQuery: `followers:>8000 repos:>5 type:user -user:${seed}`,
      sort: 'followers',
      order: 'desc',
      explanation: 'fallback-high-follow',
    });
  } else if (f > 20_000) {
    out.push({
      githubQuery: `followers:>2000 repos:>3 type:user -user:${seed}`,
      sort: 'followers',
      order: 'desc',
      explanation: 'fallback-mid-follow',
    });
  } else if (f > 500) {
    out.push({
      githubQuery: `followers:>100 repos:>2 type:user -user:${seed}`,
      sort: 'followers',
      order: 'desc',
      explanation: 'fallback-low-follow',
    });
  }
  out.push({
    githubQuery: `repos:>15 type:user -user:${seed}`,
    sort: 'followers',
    order: 'desc',
    explanation: 'fallback-repos-wide',
  });
  return out;
}

function mapSearchItemsToSimilar(
  filtered: GHSearchUserItem[],
  seed: string,
): Pick<SimilarPersonRow, 'githubUsername' | 'avatarUrl' | 'similarityPercent'>[] {
  const f = filtered.filter((u) => u.login?.toLowerCase() !== seed && (!u.type || String(u.type).toLowerCase() === 'user'));
  const scores = f.map((u) => (typeof u.score === 'number' && u.score > 0 ? u.score : 0));
  const maxScore = Math.max(...scores, 0);
  return f.slice(0, 100).map((u, idx) => {
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

/**
 * 用 LLM 根据画像综合叙述生成 GitHub Search；空结果时用 OR 语言 / 粉丝带等多档兜底。
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
  let merged: ParsedQuery = {
    ...parsed,
    githubQuery: ensureQueryExcludesSeed(parsed.githubQuery, seed),
  };
  console.log(`[GitHubProfileGraph] similar LLM q="${merged.githubQuery}" (${parsed.explanation})`);

  let items: GHSearchUserItem[] = [];
  try {
    items = await runGitHubUserSearchFromParsed(merged, token, { perPage: 100, enrichProfiles: false });
  } catch (e) {
    console.warn('[GitHubProfileGraph] similar primary search failed', e);
    try {
      const fallback = await parseQueryToGitHubSearch(
        `${narrative}\n\n【重试】上次 q 非法或过严。请输出更短、更宽的 githubQuery；多个 language 必须用 OR。`,
      );
      merged = { ...fallback, githubQuery: ensureQueryExcludesSeed(fallback.githubQuery, seed) };
      items = await runGitHubUserSearchFromParsed(merged, token, { perPage: 100, enrichProfiles: false });
    } catch (e2) {
      console.warn('[GitHubProfileGraph] similar LLM retry failed', e2);
    }
  }

  let rows = mapSearchItemsToSimilar(items, seed);
  if (rows.length === 0) {
    const fallbacks = buildSimilarFallbackQueries(seed, crawl, analysis);
    for (const fb of fallbacks) {
      const q = ensureQueryExcludesSeed(fb.githubQuery, seed);
      try {
        const next = await runGitHubUserSearchFromParsed(
          { ...fb, githubQuery: q },
          token,
          { perPage: 100, enrichProfiles: false },
        );
        rows = mapSearchItemsToSimilar(next, seed);
        if (rows.length > 0) {
          console.log(`[GitHubProfileGraph] similar recovered via ${fb.explanation} (${rows.length})`);
          break;
        }
      } catch (e) {
        console.warn(`[GitHubProfileGraph] similar fallback ${fb.explanation} failed`, e);
      }
    }
  }
  return enrichPeopleWithSummaries(rows, token);
}

interface GHContributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

interface GHSimpleUser {
  login: string;
  avatar_url: string;
}

function repoFullName(repo: GHRepo, crawlUsername: string): string | null {
  if (repo.full_name?.includes('/')) return repo.full_name;
  if (repo.name && crawlUsername) return `${crawlUsername}/${repo.name}`;
  return null;
}

async function mergeFollowGraph(
  seed: string,
  token: string | undefined,
  weight: Map<string, { avatar: string; w: number }>,
  label: 'followers' | 'following',
  baseWeight: number,
): Promise<void> {
  const url = `${GH_API}/users/${encodeURIComponent(seed)}/${label}?per_page=100`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    console.warn(`[GitHubProfileGraph] ${label} ${res.status} for @${seed}`);
    return;
  }
  const arr = (await res.json()) as GHSimpleUser[];
  if (!Array.isArray(arr)) return;
  for (const u of arr) {
    if (!u.login || u.login.toLowerCase() === seed) continue;
    const prev = weight.get(u.login) || { avatar: u.avatar_url || '', w: 0 };
    prev.w += baseWeight;
    if (u.avatar_url) prev.avatar = u.avatar_url;
    weight.set(u.login, prev);
  }
}

/**
 * 高星仓库 contributors；若全失败或为空，用 followers / following 兜底（保证有名用户也有结果）。
 */
export async function fetchGitHubRelationPeople(
  seedLogin: string,
  crawl: GitHubCrawlResult,
  token: string | undefined,
): Promise<RelationPersonRow[]> {
  const seed = seedLogin.toLowerCase();
  const owner = (crawl.username || seedLogin).replace(/^@/, '');
  const top = [...(crawl.repos || [])]
    .filter((r) => !r.fork && (r.full_name?.includes('/') || r.name))
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 20);

  const weight = new Map<string, { avatar: string; w: number }>();

  for (const repo of top) {
    const fn = repoFullName(repo, owner);
    if (!fn) continue;
    try {
      const url = `${GH_API}/repos/${encodeURIComponent(fn)}/contributors?per_page=100`;
      const res = await fetch(url, { headers: ghHeaders(token) });
      if (!res.ok) {
        console.warn(`[GitHubProfileGraph] contributors ${fn} → ${res.status}`);
        continue;
      }
      const list = (await res.json()) as GHContributor[];
      if (!Array.isArray(list)) continue;
      for (const c of list) {
        if (!c.login || c.login.toLowerCase() === seed) continue;
        const prev = weight.get(c.login) || { avatar: c.avatar_url || '', w: 0 };
        prev.w += Math.min(c.contributions || 0, 500);
        if (c.avatar_url) prev.avatar = c.avatar_url;
        weight.set(c.login, prev);
      }
    } catch (e) {
      console.warn(`[GitHubProfileGraph] contributors ${fn} error`, e);
    }
  }

  if (weight.size === 0) {
    console.warn(`[GitHubProfileGraph] no contributors aggregated for @${seed}, using followers/following`);
    await mergeFollowGraph(seed, token, weight, 'followers', 25);
    await mergeFollowGraph(seed, token, weight, 'following', 12);
  }

  const rows = [...weight.entries()]
    .map(([login, v]) => ({ login, ...v }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 100);

  const maxW = Math.max(...rows.map((r) => r.w), 1);
  const mapped = rows.map((r) => ({
    githubUsername: r.login,
    avatarUrl: r.avatar || `https://github.com/${encodeURIComponent(r.login)}.png`,
    rawWeight: r.w,
    connectionDensity: Math.min(100, Math.max(5, Math.round((r.w / maxW) * 100))),
  }));
  return enrichPeopleWithSummaries(mapped, token);
}
