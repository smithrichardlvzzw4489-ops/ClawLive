/**
 * Fetch public Codernet GitHub portrait for OG / share PNG generation (server/edge).
 */

/** Response header + upstream API header for correlating Edge image logs with Node lookup logs. */
export const CODENET_SHARE_TRACE_HEADER = 'X-Codernet-Trace-Id';

export type CodernetPortraitShareTopRepo = {
  name: string;
  stars: number;
  language: string | null;
  description: string | null;
};

export type CodernetPortraitShareInsights = {
  communityInfluenceScore?: number;
  knowledgeSharingScore?: number;
  packageImpactScore?: number;
  aiMlImpactScore?: number;
  algorithmScore?: number;
};

export type CodernetPortraitShareAiEngagement = {
  overall: number;
  levelLabel: string;
  summary: string;
  breakdown: {
    aiProjects: number;
    aiToolUsage: number;
    aiModelPublishing: number;
    aiKnowledgeSharing: number;
    aiPackageContrib: number;
  };
};

export type CodernetPortraitSharePayload = {
  ghUsername: string;
  displayName: string;
  avatarUrl: string;
  oneLiner: string | null;
  bio: string | null;
  repos: number;
  stars: number;
  followers: number;
  following: number;
  location: string | null;
  company: string | null;
  blog: string | null;
  sharpCommentary: string | null;
  techTags: string[];
  langs: { language: string; percent: number }[];
  quadrant: { frontend: number; backend: number; infra: number; ai_ml: number } | null;
  platforms: string[];
  insights: CodernetPortraitShareInsights | null;
  aiEngagement: CodernetPortraitShareAiEngagement | null;
  topRepos: CodernetPortraitShareTopRepo[];
  multiPlatformLines: string[];
  recentActivityLines: string[];
};

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const MAX_TECH_TAGS_SHARE = 64;
const MAX_LANGS_SHARE = 24;
const MAX_TOP_REPOS_SHARE = 18;
const MAX_MP_LINES = 40;
const REPO_DESC_MAX = 100;

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
}

function truncateLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildMultiPlatformLines(mp: unknown): string[] {
  const lines: string[] = [];
  const o = asRecord(mp);
  if (!o) return lines;

  const ig = asRecord(o.identityGraph);
  if (ig && Array.isArray(ig.platforms) && ig.platforms.length) {
    const conf =
      typeof ig.overallConfidence === 'number' ? Math.round(ig.overallConfidence * 100) : null;
    const platStr = ig.platforms.map(String).join('、');
    lines.push(conf != null ? `身份关联：${platStr}（置信度 ${conf}%）` : `身份关联：${platStr}`);
  }

  const so = asRecord(o.stackOverflow);
  if (so && typeof so.reputation === 'number') {
    const a = typeof so.answerCount === 'number' ? so.answerCount : 0;
    const q = typeof so.questionCount === 'number' ? so.questionCount : 0;
    lines.push(`Stack Overflow：声望 ${so.reputation.toLocaleString()} · 回答 ${a} · 提问 ${q}`);
    const topTags = Array.isArray(so.topTags) ? so.topTags : [];
    if (topTags.length) {
      const tagStr = topTags
        .slice(0, 6)
        .map((t) => {
          const tr = asRecord(t);
          return tr && typeof tr.name === 'string' ? tr.name : null;
        })
        .filter(Boolean)
        .join('、');
      if (tagStr) lines.push(`  常用标签：${tagStr}`);
    }
  }

  const npm = Array.isArray(o.npmPackages) ? o.npmPackages : [];
  if (npm.length) {
    let total = 0;
    for (const p of npm) {
      const pr = asRecord(p);
      if (pr && typeof pr.weeklyDownloads === 'number') total += pr.weeklyDownloads;
    }
    lines.push(`npm：${npm.length} 个包 · 周下载合计约 ${total.toLocaleString()}`);
    for (const p of npm.slice(0, 4)) {
      const pr = asRecord(p);
      if (!pr || typeof pr.name !== 'string') continue;
      const ver = typeof pr.version === 'string' ? pr.version : '';
      const dl = typeof pr.weeklyDownloads === 'number' ? pr.weeklyDownloads : 0;
      lines.push(`  · ${pr.name}${ver ? ` v${ver}` : ''} — ${dl.toLocaleString()}/周`);
    }
  }

  const pypi = Array.isArray(o.pypiPackages) ? o.pypiPackages : [];
  if (pypi.length) {
    lines.push(`PyPI：${pypi.length} 个项目`);
    for (const p of pypi.slice(0, 3)) {
      const pr = asRecord(p);
      if (!pr || typeof pr.name !== 'string') continue;
      const ver = typeof pr.version === 'string' ? ` v${pr.version}` : '';
      lines.push(`  · ${pr.name}${ver}`);
    }
  }

  const devto = asRecord(o.devto);
  if (devto && (typeof devto.articlesCount === 'number' || typeof devto.totalReactions === 'number')) {
    const ac = typeof devto.articlesCount === 'number' ? devto.articlesCount : 0;
    const tr = typeof devto.totalReactions === 'number' ? devto.totalReactions : 0;
    lines.push(`DEV.to：${ac} 篇文章 · ${tr} 互动`);
    const articles = Array.isArray(devto.topArticles) ? devto.topArticles : [];
    for (const item of articles.slice(0, 2)) {
      const ar = asRecord(item);
      if (ar && typeof ar.title === 'string') lines.push(`  · ${truncateLine(ar.title, 80)}`);
    }
  }

  const hf = asRecord(o.huggingface);
  if (hf) {
    const models = Array.isArray(hf.models) ? hf.models.length : 0;
    const datasets = Array.isArray(hf.datasets) ? hf.datasets.length : 0;
    const spaces = Array.isArray(hf.spaces) ? hf.spaces.length : 0;
    const td = typeof hf.totalDownloads === 'number' ? hf.totalDownloads : 0;
    if (models || datasets || spaces) {
      lines.push(
        `Hugging Face：模型 ${models} · 数据集 ${datasets} · Space ${spaces} · 下载 ${td.toLocaleString()}`,
      );
      const tags = Array.isArray(hf.topPipelineTags)
        ? hf.topPipelineTags.filter((x): x is string => typeof x === 'string').slice(0, 5)
        : [];
      if (tags.length) lines.push(`  管线标签：${tags.join('、')}`);
    }
  }

  const gl = asRecord(o.gitlab);
  if (gl && typeof gl.publicRepos === 'number') {
    const un = typeof gl.username === 'string' ? gl.username : '';
    const fol = typeof gl.followers === 'number' ? gl.followers : 0;
    lines.push(`GitLab：@${un} · 公开项目 ${gl.publicRepos} · 粉丝 ${fol}`);
    const tops = Array.isArray(gl.topProjects) ? gl.topProjects : [];
    for (const prj of tops.slice(0, 3)) {
      const p = asRecord(prj);
      if (p && typeof p.name === 'string') {
        const st = typeof p.stars === 'number' ? p.stars : 0;
        lines.push(`  · ${p.name} ★${st}`);
      }
    }
  }

  const lc = asRecord(o.leetcode);
  if (lc && typeof lc.totalSolved === 'number') {
    const parts = [`LeetCode：已解 ${lc.totalSolved}`];
    if (typeof lc.contestRating === 'number') parts.push(`Rating ${lc.contestRating}`);
    lines.push(parts.join(' · '));
  }

  const kg = asRecord(o.kaggle);
  if (kg && typeof kg.username === 'string') {
    const tier = typeof kg.tier === 'string' ? kg.tier : '';
    const pts = typeof kg.points === 'number' ? kg.points : 0;
    const g = typeof kg.goldMedals === 'number' ? kg.goldMedals : 0;
    const s = typeof kg.silverMedals === 'number' ? kg.silverMedals : 0;
    const b = typeof kg.bronzeMedals === 'number' ? kg.bronzeMedals : 0;
    lines.push(`Kaggle：@${kg.username} ${tier} · ${pts.toLocaleString()} pts · 🥇${g} 🥈${s} 🥉${b}`);
  }

  const cf = asRecord(o.codeforces);
  if (cf && typeof cf.rating === 'number') {
    const h = typeof cf.handle === 'string' ? cf.handle : '';
    const rk = typeof cf.rank === 'string' ? cf.rank : '';
    const cc = typeof cf.contestCount === 'number' ? cf.contestCount : 0;
    lines.push(`Codeforces：@${h} · 积分 ${cf.rating} · ${rk} · 场次 ${cc}`);
  }

  const dh = asRecord(o.dockerhub);
  if (dh && Array.isArray(dh.repositories) && dh.repositories.length) {
    const pulls = typeof dh.totalPulls === 'number' ? dh.totalPulls : 0;
    lines.push(`Docker Hub：${dh.repositories.length} 个仓库 · 拉取 ${pulls.toLocaleString()}`);
    for (const r of dh.repositories.slice(0, 3)) {
      const rr = asRecord(r);
      if (rr && typeof rr.name === 'string') {
        const pc = typeof rr.pullCount === 'number' ? rr.pullCount : 0;
        lines.push(`  · ${rr.name} — ${pc.toLocaleString()} pulls`);
      }
    }
  }

  const cr = asRecord(o.cratesio);
  if (cr && Array.isArray(cr.crates) && cr.crates.length) {
    const td = typeof cr.totalDownloads === 'number' ? cr.totalDownloads : 0;
    lines.push(`crates.io：${cr.crates.length} 个 crate · 下载 ${td.toLocaleString()}`);
    for (const c of cr.crates.slice(0, 3)) {
      const crn = asRecord(c);
      if (crn && typeof crn.name === 'string') lines.push(`  · ${crn.name}`);
    }
  }

  return lines.slice(0, MAX_MP_LINES);
}

function formatRecentCommits(commits: unknown): string[] {
  if (!Array.isArray(commits)) return [];
  const out: string[] = [];
  for (const c of commits.slice(0, 6)) {
    const r = asRecord(c);
    if (!r) continue;
    const repo = typeof r.repo === 'string' ? r.repo : '';
    const msg = typeof r.message === 'string' ? truncateLine(r.message, 72) : '';
    const date = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
    if (repo || msg) out.push(`${repo} — ${msg}${date ? ` (${date})` : ''}`);
  }
  return out;
}

function mapTopReposFromCrawl(repos: unknown): CodernetPortraitShareTopRepo[] {
  if (!Array.isArray(repos)) return [];
  const rows = repos
    .map((raw) => asRecord(raw))
    .filter((x): x is Record<string, unknown> => !!x)
    .filter((x) => x.fork !== true)
    .sort(
      (a, b) =>
        (Number(b.stargazers_count) || 0) - (Number(a.stargazers_count) || 0),
    )
    .slice(0, MAX_TOP_REPOS_SHARE)
    .map((x) => {
      const desc = typeof x.description === 'string' ? truncate(x.description, REPO_DESC_MAX) : null;
      return {
        name: String(x.name || ''),
        stars: Number(x.stargazers_count) || 0,
        language: typeof x.language === 'string' ? x.language : null,
        description: desc || null,
      };
    });
  return rows.filter((r) => r.name.length > 0);
}

function parseInsights(raw: unknown): CodernetPortraitShareInsights | null {
  const o = asRecord(raw);
  if (!o) return null;
  const pick = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : undefined);
  const out: CodernetPortraitShareInsights = {
    communityInfluenceScore: pick('communityInfluenceScore'),
    knowledgeSharingScore: pick('knowledgeSharingScore'),
    packageImpactScore: pick('packageImpactScore'),
    aiMlImpactScore: pick('aiMlImpactScore'),
    algorithmScore: pick('algorithmScore'),
  };
  const has = Object.values(out).some((v) => v != null);
  return has ? out : null;
}

function parseAiEngagement(raw: unknown): CodernetPortraitShareAiEngagement | null {
  const aer = asRecord(raw);
  if (!aer || typeof aer.overall !== 'number') return null;
  const bd = asRecord(aer.breakdown);
  return {
    overall: aer.overall,
    levelLabel: typeof aer.levelLabel === 'string' ? aer.levelLabel : '',
    summary: typeof aer.summary === 'string' ? aer.summary : '',
    breakdown: {
      aiProjects: Number(bd?.aiProjects) || 0,
      aiToolUsage: Number(bd?.aiToolUsage) || 0,
      aiModelPublishing: Number(bd?.aiModelPublishing) || 0,
      aiKnowledgeSharing: Number(bd?.aiKnowledgeSharing) || 0,
      aiPackageContrib: Number(bd?.aiPackageContrib) || 0,
    },
  };
}

export type CodernetPortraitFetchMeta = {
  httpStatus: number;
  jsonStatus?: string;
  durationMs: number;
};

export async function fetchCodernetPortraitForShareWithMeta(
  ghUsername: string,
  opts?: { traceId?: string },
): Promise<{ data: CodernetPortraitSharePayload | null; meta: CodernetPortraitFetchMeta }> {
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const u = decodeURIComponent(ghUsername).trim().toLowerCase();
  if (!u) {
    return { data: null, meta: { httpStatus: 0, jsonStatus: 'empty_username', durationMs: 0 } };
  }

  const t0 = Date.now();
  const headers: Record<string, string> = {};
  if (opts?.traceId) headers['X-Codernet-Trace-Id'] = opts.traceId;

  const res = await fetch(`${api}/api/codernet/github/${encodeURIComponent(u)}`, {
    headers,
    next: { revalidate: 300 },
  });
  const durationMs = Date.now() - t0;
  if (!res.ok) {
    return {
      data: null,
      meta: { httpStatus: res.status, durationMs },
    };
  }
  const json = (await res.json()) as {
    status?: string;
    multiPlatform?: unknown;
    crawl?: {
      username?: string;
      bio?: string | null;
      totalPublicRepos?: number;
      totalStars?: number;
      followers?: number;
      following?: number;
      location?: string | null;
      company?: string | null;
      blog?: string | null;
      repos?: unknown;
      recentCommits?: unknown;
    };
    analysis?: {
      oneLiner?: string;
      sharpCommentary?: string;
      techTags?: string[];
      languageDistribution?: { language: string; percent: number }[];
      capabilityQuadrant?: { frontend: number; backend: number; infra: number; ai_ml: number };
      platformsUsed?: string[];
      multiPlatformInsights?: unknown;
      aiEngagement?: unknown;
    };
    avatarUrl?: string;
  };

  if (json.status !== 'ready' || !json.crawl) {
    return {
      data: null,
      meta: {
        httpStatus: res.status,
        jsonStatus: typeof json.status === 'string' ? json.status : undefined,
        durationMs,
      },
    };
  }

  const crawl = json.crawl;
  const analysis = json.analysis;
  const avatarUrl =
    json.avatarUrl?.trim() || `https://github.com/${encodeURIComponent(u)}.png`;

  const techTagsRaw = Array.isArray(analysis?.techTags) ? analysis!.techTags! : [];
  const techTags = techTagsRaw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .slice(0, MAX_TECH_TAGS_SHARE);

  const langsRaw = Array.isArray(analysis?.languageDistribution)
    ? analysis!.languageDistribution!
    : [];
  const langs = langsRaw
    .filter(
      (l): l is { language: string; percent: number } =>
        !!l &&
        typeof l.language === 'string' &&
        typeof l.percent === 'number' &&
        !Number.isNaN(l.percent),
    )
    .slice(0, MAX_LANGS_SHARE);

  const mpLines = buildMultiPlatformLines(json.multiPlatform);
  const topRepos = mapTopReposFromCrawl(crawl.repos);
  const recentActivityLines = formatRecentCommits(crawl.recentCommits);

  return {
    data: {
      ghUsername: u,
      displayName: crawl.username || u,
      avatarUrl,
      oneLiner: analysis?.oneLiner ?? null,
      bio: crawl.bio ?? null,
      repos: crawl.totalPublicRepos ?? 0,
      stars: crawl.totalStars ?? 0,
      followers: crawl.followers ?? 0,
      following: crawl.following ?? 0,
      location: crawl.location ?? null,
      company: crawl.company ?? null,
      blog: crawl.blog ?? null,
      sharpCommentary: analysis?.sharpCommentary ?? null,
      techTags,
      langs,
      quadrant: analysis?.capabilityQuadrant ?? null,
      platforms: Array.isArray(analysis?.platformsUsed) && analysis!.platformsUsed!.length
        ? analysis!.platformsUsed!
        : ['GitHub'],
      insights: parseInsights(analysis?.multiPlatformInsights),
      aiEngagement: parseAiEngagement(analysis?.aiEngagement),
      topRepos,
      multiPlatformLines: mpLines,
      recentActivityLines,
    },
    meta: { httpStatus: res.status, jsonStatus: 'ready', durationMs },
  };
}

export async function fetchCodernetPortraitForShare(
  ghUsername: string,
  opts?: { traceId?: string },
): Promise<CodernetPortraitSharePayload | null> {
  const { data } = await fetchCodernetPortraitForShareWithMeta(ghUsername, opts);
  return data;
}

export function truncateForOg(text: string | null | undefined, max: number): string {
  return truncate(text, max);
}
