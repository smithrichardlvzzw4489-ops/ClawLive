import { randomUUID } from 'crypto';
import type { JobPosting, JobPostingCandidate } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { searchDevelopers, type DeveloperSearchResult } from './codernet-search';
import { getServerGitHubToken } from './github-crawler';
import { checkQuota, checkQuotaHasRemaining, consumeQuota } from './quota-manager';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parsePositiveInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 首次同步推荐消耗的 recruitment_recommend 点数（额度大、结果多） */
export const RECRUIT_FIRST_RECOMMEND_QUOTA_COST = () =>
  parsePositiveInt('RECRUIT_FIRST_RECOMMEND_QUOTA_COST', 12);
/** 非首次手动点击推荐 */
export const RECRUIT_MANUAL_RECOMMEND_QUOTA_COST = () =>
  parsePositiveInt('RECRUIT_MANUAL_RECOMMEND_QUOTA_COST', 2);
/** 每周后台任务每个 JD 消耗点数 */
export const RECRUIT_WEEKLY_RECOMMEND_QUOTA_COST = () =>
  parsePositiveInt('RECRUIT_WEEKLY_RECOMMEND_QUOTA_COST', 2);
/** 每周每个 JD 最多追加几条进待查看池 */
export const RECRUIT_WEEKLY_RECOMMEND_ADD = () =>
  parsePositiveInt('RECRUIT_WEEKLY_RECOMMEND_ADD', 5);

export type RecruitmentRecommendHit = {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  score: number;
  reason: string;
  stats: { totalPublicRepos: number; totalStars: number; followers: number };
  location: string | null;
  source?: 'sync' | 'weekly';
};

export function buildCombinedQueryFromJd(jd: {
  title: string;
  companyName: string | null;
  location: string | null;
  body: string;
  matchTags: unknown;
}): string {
  const tags = Array.isArray(jd.matchTags)
    ? jd.matchTags.filter((x): x is string => typeof x === 'string')
    : [];
  const tagLine = tags.length ? `【匹配标签】\n${tags.join('、')}` : '';
  return [
    `【职位标题】\n${jd.title}`,
    jd.companyName ? `【公司】\n${jd.companyName}` : '',
    jd.location ? `【地点】\n${jd.location}` : '',
    `【职位描述 JD】\n${jd.body.slice(0, 12_000)}`,
    tagLine,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function mapDeveloperToRecommendHit(
  r: DeveloperSearchResult,
  source: RecruitmentRecommendHit['source'],
): RecruitmentRecommendHit {
  return {
    githubUsername: r.githubUsername,
    avatarUrl: r.avatarUrl,
    oneLiner: r.oneLiner,
    techTags: r.techTags,
    score: r.score,
    reason: r.reason,
    stats: r.stats,
    location: r.location,
    source,
  };
}

export function parsePendingRecommendHits(raw: unknown): RecruitmentRecommendHit[] {
  if (!Array.isArray(raw)) return [];
  const out: RecruitmentRecommendHit[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const gh = typeof o.githubUsername === 'string' ? o.githubUsername.trim() : '';
    if (!gh) continue;
    out.push({
      githubUsername: gh,
      avatarUrl: typeof o.avatarUrl === 'string' ? o.avatarUrl : '',
      oneLiner: typeof o.oneLiner === 'string' ? o.oneLiner : '',
      techTags: Array.isArray(o.techTags) ? o.techTags.filter((t): t is string => typeof t === 'string') : [],
      score: typeof o.score === 'number' ? o.score : 0,
      reason: typeof o.reason === 'string' ? o.reason : '',
      stats:
        o.stats && typeof o.stats === 'object'
          ? {
              totalPublicRepos: Number((o.stats as { totalPublicRepos?: unknown }).totalPublicRepos) || 0,
              totalStars: Number((o.stats as { totalStars?: unknown }).totalStars) || 0,
              followers: Number((o.stats as { followers?: unknown }).followers) || 0,
            }
          : { totalPublicRepos: 0, totalStars: 0, followers: 0 },
      location: typeof o.location === 'string' ? o.location : null,
      source: o.source === 'weekly' || o.source === 'sync' ? o.source : 'weekly',
    });
  }
  return out;
}

function excludeUsernames(jd: JobPosting & { candidates: JobPostingCandidate[] }): Set<string> {
  const s = new Set<string>();
  for (const c of jd.candidates) {
    s.add(c.githubUsername.trim().toLowerCase());
  }
  for (const h of parsePendingRecommendHits(jd.pendingRecommendHits)) {
    s.add(h.githubUsername.trim().toLowerCase());
  }
  return s;
}

/**
 * 周更：对已做过首次推荐的 JD，按周合并少量新候选人进 pendingRecommendHits（扣 recruitment_recommend）。
 */
export async function runRecruitmentWeeklyRecommendJobs(): Promise<void> {
  const token = getServerGitHubToken();
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const rows = await prisma.jobPosting.findMany({
    where: {
      firstRecommendAt: { not: null },
      OR: [{ lastWeeklyRecommendAt: null }, { lastWeeklyRecommendAt: { lt: weekAgo } }],
      status: { not: 'closed' },
    },
    include: { candidates: true },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  });

  const weeklyCost = RECRUIT_WEEKLY_RECOMMEND_QUOTA_COST();
  const addCap = RECRUIT_WEEKLY_RECOMMEND_ADD();

  for (const jd of rows) {
    const authorId = jd.authorId;
    if (!checkQuotaHasRemaining(authorId, 'recruitment_recommend', weeklyCost).allowed) {
      continue;
    }

    try {
      const combined = buildCombinedQueryFromJd(jd);
      const pack = await searchDevelopers(combined, new Map() as never, token, undefined, {
        requestId: randomUUID(),
      });
      const exclude = excludeUsernames(jd);
      const fresh: RecruitmentRecommendHit[] = [];
      for (const r of pack.results) {
        if (fresh.length >= addCap) break;
        const login = r.githubUsername.trim().toLowerCase();
        if (exclude.has(login)) continue;
        exclude.add(login);
        fresh.push(mapDeveloperToRecommendHit(r, 'weekly'));
      }

      const now = new Date();
      if (fresh.length > 0) {
        consumeQuota(authorId, 'recruitment_recommend', weeklyCost);
        const prev = parsePendingRecommendHits(jd.pendingRecommendHits);
        const merged = [...prev, ...fresh];
        const cap = 120;
        const trimmed = merged.slice(-cap);
        await prisma.jobPosting.update({
          where: { id: jd.id },
          data: {
            lastWeeklyRecommendAt: now,
            pendingRecommendHits: trimmed as object[],
          },
        });
      } else {
        await prisma.jobPosting.update({
          where: { id: jd.id },
          data: { lastWeeklyRecommendAt: now },
        });
      }
    } catch (e) {
      console.error('[recruitment] weekly job jd', jd.id, e);
    }
  }
}

export function startRecruitmentWeeklyRecommendScheduler(): void {
  import('node-cron')
    .then(({ default: cron }) => {
      const expr = (process.env.RECRUIT_WEEKLY_CRON || '0 9 * * 1').trim();
      if (!cron.validate(expr)) {
        console.warn('[recruitment] invalid RECRUIT_WEEKLY_CRON, skip scheduler:', expr);
        return;
      }
      cron.schedule(expr, () => {
        void runRecruitmentWeeklyRecommendJobs().catch((err) =>
          console.error('[recruitment] weekly scheduler', err),
        );
      });
      console.log('[recruitment] weekly recommend scheduler:', expr);
    })
    .catch((e) => console.error('[recruitment] failed to load node-cron', e));
}
