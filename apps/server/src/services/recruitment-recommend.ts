import { randomUUID } from 'crypto';
import type { JobPosting, JobPostingCandidate } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { railwayDiag } from '../lib/railway-diag';
import { searchDevelopers, type DeveloperSearchResult } from './codernet-search';
import { getServerGitHubToken } from './github-crawler';
import { checkQuotaHasRemaining, consumeQuota } from './quota-manager';

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
/** 每日后台补缺搜索每个 JD 消耗点数（优先 `RECRUIT_DAILY_REFILL_QUOTA_COST`，否则兼容旧 `RECRUIT_WEEKLY_RECOMMEND_QUOTA_COST`） */
export const RECRUIT_DAILY_REFILL_QUOTA_COST = () => {
  const d = parseInt(process.env.RECRUIT_DAILY_REFILL_QUOTA_COST || '', 10);
  if (Number.isFinite(d) && d > 0) return d;
  const w = parseInt(process.env.RECRUIT_WEEKLY_RECOMMEND_QUOTA_COST || '', 10);
  if (Number.isFinite(w) && w > 0) return w;
  return 2;
};
/** 每日从 backlog 推入待查看池的人数 */
export const RECRUIT_DAILY_RECOMMEND_ADD = () =>
  parsePositiveInt('RECRUIT_DAILY_RECOMMEND_ADD', 10);
/** 创建 JD 后轮询推荐写入待查看池的首批人数 */
export const RECRUIT_INITIAL_PENDING_TAKE = () =>
  parsePositiveInt('RECRUIT_INITIAL_PENDING_TAKE', 40);
/** 待查看池最多保留条数（超出丢弃最旧） */
export const RECRUIT_PENDING_CAP = () => parsePositiveInt('RECRUIT_PENDING_CAP', 200);

export type RecruitmentRecommendHit = {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  score: number;
  reason: string;
  stats: { totalPublicRepos: number; totalStars: number; followers: number };
  location: string | null;
  source?: 'sync' | 'weekly' | 'daily';
  /** ISO 8601：进入「待查看池」的时间（用于前端展示） */
  addedAt?: string;
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
    const src = o.source;
    const source: RecruitmentRecommendHit['source'] =
      src === 'weekly' || src === 'sync' || src === 'daily' ? src : 'sync';
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
      source,
      addedAt: typeof o.addedAt === 'string' ? o.addedAt : undefined,
    });
  }
  return out;
}

/** 已在候选人表或待查看池中的 GitHub login（从 backlog 取数时不应再排除 backlog 自身） */
function excludeCandidatesAndPending(
  candidates: JobPostingCandidate[],
  pendingHits: RecruitmentRecommendHit[],
): Set<string> {
  const s = new Set<string>();
  for (const c of candidates) {
    s.add(c.githubUsername.trim().toLowerCase());
  }
  for (const h of pendingHits) {
    s.add(h.githubUsername.trim().toLowerCase());
  }
  return s;
}

/** 候选人 + 待查看 + backlog 全部 login（补缺搜索去重用） */
function excludeCandidatesPendingAndBacklog(
  candidates: JobPostingCandidate[],
  pendingHits: RecruitmentRecommendHit[],
  backlogHits: RecruitmentRecommendHit[],
): Set<string> {
  const s = excludeCandidatesAndPending(candidates, pendingHits);
  for (const h of backlogHits) {
    s.add(h.githubUsername.trim().toLowerCase());
  }
  return s;
}

const BOOTSTRAP_STALE_MS = 50 * 60 * 1000;

const BOOTSTRAP_TRACE_MAX_STEPS = 80;
const BOOTSTRAP_DETAIL_MAX = 400;

export type RecruitmentBootstrapTraceStep = {
  at: string;
  phase: string;
  ok: boolean;
  detail?: string;
  meta?: Record<string, unknown>;
};

function truncateDetail(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= BOOTSTRAP_DETAIL_MAX ? t : `${t.slice(0, BOOTSTRAP_DETAIL_MAX)}…`;
}

export function parseRecruitmentBootstrapTrace(raw: unknown): RecruitmentBootstrapTraceStep[] {
  if (!Array.isArray(raw)) return [];
  const out: RecruitmentBootstrapTraceStep[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const at = typeof o.at === 'string' ? o.at : '';
    const phase = typeof o.phase === 'string' ? o.phase : '';
    if (!at || !phase) continue;
    const ok = o.ok === true;
    const step: RecruitmentBootstrapTraceStep = { at, phase, ok };
    if (typeof o.detail === 'string' && o.detail) step.detail = o.detail;
    if (o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta)) {
      step.meta = o.meta as Record<string, unknown>;
    }
    out.push(step);
  }
  return out;
}

export type RecruitmentBootstrapQueueDiag = {
  steps: RecruitmentBootstrapTraceStep[];
  lastPhase: string | null;
  lastOk: boolean | null;
  /** 与首轮异步引导相关的粗粒度结论（由 DB 状态 + 末步推导，不靠猜） */
  outcome: 'idle' | 'running' | 'succeeded' | 'aborted' | 'failed' | 'stuck';
};

export function diagnoseRecruitmentBootstrapQueue(jd: {
  firstRecommendAt: Date | null;
  recommendBootstrapStartedAt: Date | null;
  recommendBootstrapTrace: unknown;
}): RecruitmentBootstrapQueueDiag {
  const steps = parseRecruitmentBootstrapTrace(jd.recommendBootstrapTrace);
  const last = steps.length ? steps[steps.length - 1]! : null;
  const lastPhase = last?.phase ?? null;
  const lastOk = last != null ? last.ok : null;

  if (jd.firstRecommendAt != null) {
    return { steps, lastPhase, lastOk, outcome: 'succeeded' };
  }
  const blocking = isRecruitmentBootstrapBlocking({
    firstRecommendAt: jd.firstRecommendAt,
    recommendBootstrapStartedAt: jd.recommendBootstrapStartedAt,
  });
  if (blocking) {
    return { steps, lastPhase, lastOk, outcome: 'running' };
  }
  if (jd.recommendBootstrapStartedAt != null && !blocking) {
    return { steps, lastPhase, lastOk, outcome: 'stuck' };
  }
  if (!last) {
    return { steps, lastPhase, lastOk, outcome: 'idle' };
  }
  if (!last.ok && typeof last.phase === 'string' && last.phase.startsWith('abort_')) {
    return { steps, lastPhase, lastOk, outcome: 'aborted' };
  }
  if (!last.ok || last.phase === 'error') {
    return { steps, lastPhase, lastOk, outcome: 'failed' };
  }
  return { steps, lastPhase, lastOk, outcome: 'idle' };
}

async function resetRecruitmentBootstrapTrace(
  jobPostingId: string,
  first: RecruitmentBootstrapTraceStep,
): Promise<void> {
  await prisma.jobPosting.update({
    where: { id: jobPostingId },
    data: { recommendBootstrapTrace: [first] as object[] },
  });
}

async function appendRecruitmentBootstrapTrace(
  jobPostingId: string,
  step: Omit<RecruitmentBootstrapTraceStep, 'at'> & { at?: string; detail?: string; meta?: Record<string, unknown> },
): Promise<void> {
  const full: RecruitmentBootstrapTraceStep = {
    at: step.at ?? new Date().toISOString(),
    phase: step.phase,
    ok: step.ok,
    ...(step.detail != null && step.detail !== '' ? { detail: truncateDetail(step.detail) } : {}),
    ...(step.meta != null ? { meta: step.meta } : {}),
  };
  await prisma.$transaction(async (tx) => {
    const row = await tx.jobPosting.findUnique({
      where: { id: jobPostingId },
      select: { recommendBootstrapTrace: true },
    });
    const prev = parseRecruitmentBootstrapTrace(row?.recommendBootstrapTrace);
    const next = [...prev, full].slice(-BOOTSTRAP_TRACE_MAX_STEPS);
    await tx.jobPosting.update({
      where: { id: jobPostingId },
      data: { recommendBootstrapTrace: next as object[] },
    });
  });
}

function logBootstrapPhase(jobPostingId: string, phase: string, ok: boolean, extra?: Record<string, unknown>) {
  const base = { jobPostingId, phase, ok, ...extra };
  console.log(`[recruitment] bootstrap ${JSON.stringify(base)}`);
  railwayDiag({
    area: 'recruitment',
    event: 'bootstrap.phase',
    jobPostingId,
    phase,
    ok,
    ...extra,
  });
}

/** 首轮推荐是否仍在后台排队/执行（用于手动接口避让） */
export function isRecruitmentBootstrapBlocking(jd: {
  firstRecommendAt: Date | null;
  recommendBootstrapStartedAt: Date | null;
}): boolean {
  if (jd.firstRecommendAt != null) return false;
  const t = jd.recommendBootstrapStartedAt;
  if (!t) return false;
  return Date.now() - t.getTime() < BOOTSTRAP_STALE_MS;
}

/**
 * 新建 JD 后异步执行：GitHub 合并上限 1000 的单次全量检索，首批写入待查看池，其余进 backlog；扣首次额度。
 */
export async function kickoffRecruitmentRecommendAfterJdCreate(jobPostingId: string): Promise<void> {
  const claim = await prisma.jobPosting.updateMany({
    where: {
      id: jobPostingId,
      firstRecommendAt: null,
      recommendBootstrapStartedAt: null,
      status: { not: 'closed' },
    },
    data: { recommendBootstrapStartedAt: new Date() },
  });
  if (claim.count === 0) {
    return;
  }

  const t0 = Date.now();
  const claimedAt = new Date().toISOString();
  await resetRecruitmentBootstrapTrace(jobPostingId, { at: claimedAt, phase: 'claimed', ok: true });
  logBootstrapPhase(jobPostingId, 'claimed', true);

  let searchRequestId: string | undefined;
  try {
    const jd = await prisma.jobPosting.findUnique({
      where: { id: jobPostingId },
      include: { candidates: true },
    });
    if (!jd || jd.status === 'closed') {
      await appendRecruitmentBootstrapTrace(jobPostingId, {
        phase: 'abort_jd_missing_or_closed',
        ok: false,
        detail: !jd ? 'jd_not_found' : `status=${jd.status}`,
      });
      logBootstrapPhase(jobPostingId, 'abort_jd_missing_or_closed', false);
      await prisma.jobPosting.update({
        where: { id: jobPostingId },
        data: { recommendBootstrapStartedAt: null },
      });
      return;
    }

    const authorId = jd.authorId;
    const quotaCost = RECRUIT_FIRST_RECOMMEND_QUOTA_COST();
    if (!checkQuotaHasRemaining(authorId, 'recruitment_recommend', quotaCost).allowed) {
      await appendRecruitmentBootstrapTrace(jobPostingId, {
        phase: 'abort_quota',
        ok: false,
        meta: { quotaCost },
      });
      logBootstrapPhase(jobPostingId, 'abort_quota', false, { quotaCost });
      await prisma.jobPosting.update({
        where: { id: jobPostingId },
        data: { recommendBootstrapStartedAt: null },
      });
      return;
    }

    const token = getServerGitHubToken();
    if (!token) {
      await appendRecruitmentBootstrapTrace(jobPostingId, {
        phase: 'abort_no_github_token',
        ok: false,
        detail: 'missing GITHUB_SERVER_TOKEN | GITHUB_TOKEN | GH_TOKEN',
      });
      logBootstrapPhase(jobPostingId, 'abort_no_github_token', false);
      await prisma.jobPosting.update({
        where: { id: jobPostingId },
        data: { recommendBootstrapStartedAt: null },
      });
      return;
    }

    const combined = buildCombinedQueryFromJd(jd);
    searchRequestId = randomUUID();
    await appendRecruitmentBootstrapTrace(jobPostingId, {
      phase: 'search_started',
      ok: true,
      meta: { queryCharCount: combined.length, quotaCost, requestId: searchRequestId },
    });
    logBootstrapPhase(jobPostingId, 'search_started', true, {
      queryCharCount: combined.length,
      elapsedMs: Date.now() - t0,
      requestId: searchRequestId,
    });

    const pack = await searchDevelopers(combined, new Map() as never, token, undefined, {
      requestId: searchRequestId,
      maxMergedCandidates: 1000,
      jobPostingId,
      source: 'recruitment_bootstrap',
    });

    await appendRecruitmentBootstrapTrace(jobPostingId, {
      phase: 'search_done',
      ok: true,
      meta: {
        requestId: searchRequestId,
        resultCount: pack.results.length,
        mergedGithubCount: pack.meta.mergedGithubCount,
        elapsedMsSinceStart: Date.now() - t0,
      },
    });
    logBootstrapPhase(jobPostingId, 'search_done', true, {
      requestId: searchRequestId,
      resultCount: pack.results.length,
      mergedGithubCount: pack.meta.mergedGithubCount,
      elapsedMs: Date.now() - t0,
    });

    const exclude = excludeCandidatesAndPending(jd.candidates, parsePendingRecommendHits(jd.pendingRecommendHits));

    const allHits: RecruitmentRecommendHit[] = [];
    for (const r of pack.results) {
      const login = r.githubUsername.trim().toLowerCase();
      if (exclude.has(login)) continue;
      exclude.add(login);
      allHits.push(mapDeveloperToRecommendHit(r, 'sync'));
    }

    const take = RECRUIT_INITIAL_PENDING_TAKE();
    const bootstrapStamp = new Date().toISOString();
    const pending = allHits.slice(0, take).map((h) => ({ ...h, addedAt: bootstrapStamp }));
    const backlog = allHits.slice(take).map((h) => ({ ...h, addedAt: bootstrapStamp }));

    await appendRecruitmentBootstrapTrace(jobPostingId, {
      phase: 'persisting',
      ok: true,
      meta: {
        pendingCount: pending.length,
        backlogCount: backlog.length,
        rawResultCount: pack.results.length,
        afterDedupeCount: allHits.length,
      },
    });
    logBootstrapPhase(jobPostingId, 'persisting', true, {
      requestId: searchRequestId,
      pending: pending.length,
      backlog: backlog.length,
    });

    consumeQuota(authorId, 'recruitment_recommend', quotaCost);
    await prisma.jobPosting.update({
      where: { id: jobPostingId },
      data: {
        firstRecommendAt: new Date(),
        recommendBootstrapStartedAt: null,
        pendingRecommendHits: pending as object[],
        recommendBacklogHits: backlog as object[],
      },
    });

    await appendRecruitmentBootstrapTrace(jobPostingId, {
      phase: 'complete',
      ok: true,
      meta: {
        pendingCount: pending.length,
        backlogCount: backlog.length,
        totalElapsedMs: Date.now() - t0,
      },
    });
    logBootstrapPhase(jobPostingId, 'complete', true, {
      requestId: searchRequestId,
      pending: pending.length,
      backlog: backlog.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendRecruitmentBootstrapTrace(jobPostingId, {
      phase: 'error',
      ok: false,
      detail: msg,
      ...(searchRequestId ? { meta: { requestId: searchRequestId } } : {}),
    });
    logBootstrapPhase(jobPostingId, 'error', false, {
      detail: truncateDetail(msg),
      ...(searchRequestId ? { requestId: searchRequestId } : {}),
    });
    railwayDiag({
      area: 'recruitment',
      event: 'bootstrap.error',
      level: 'error',
      jobPostingId,
      requestId: searchRequestId,
      elapsedMs: Date.now() - t0,
      error: truncateDetail(msg),
      errorName: e instanceof Error ? e.name : undefined,
    });
    console.error('[recruitment] bootstrap jd', jobPostingId, e);
    await prisma.jobPosting.update({
      where: { id: jobPostingId },
      data: { recommendBootstrapStartedAt: null },
    });
  }
}

/**
 * 每日（默认北京时间 8:00）：每个 JD 从 backlog 向待查看池移入最多 10 人（去重）；
 * backlog 不足则触发一次补缺检索（合并上限 1000）并合并进 backlog。
 */
export async function runRecruitmentDailyRecommendJobs(): Promise<void> {
  const token = getServerGitHubToken();
  const dailyAdd = RECRUIT_DAILY_RECOMMEND_ADD();
  const refillCost = RECRUIT_DAILY_REFILL_QUOTA_COST();
  const pendingCap = RECRUIT_PENDING_CAP();

  const rows = await prisma.jobPosting.findMany({
    where: {
      firstRecommendAt: { not: null },
      status: { not: 'closed' },
    },
    include: { candidates: true },
    orderBy: [{ lastDailyRecommendAt: 'asc' }],
    take: 200,
  });

  railwayDiag({
    area: 'recruitment',
    event: 'daily.tick',
    jdCount: rows.length,
    dailyAdd,
    githubTokenPresent: Boolean(token),
  });

  for (const jd of rows) {
    const authorId = jd.authorId;
    try {
      let pending = parsePendingRecommendHits(jd.pendingRecommendHits);
      let backlog = parsePendingRecommendHits(jd.recommendBacklogHits);

      const pickFromBacklog = (n: number, excludePick: Set<string>): { moved: RecruitmentRecommendHit[]; backlog: RecruitmentRecommendHit[] } => {
        const moved: RecruitmentRecommendHit[] = [];
        const rest: RecruitmentRecommendHit[] = [];
        for (const h of backlog) {
          const login = h.githubUsername.trim().toLowerCase();
          if (excludePick.has(login)) {
            continue;
          }
          if (moved.length < n) {
            excludePick.add(login);
            moved.push({ ...h, source: 'daily', addedAt: new Date().toISOString() });
          } else {
            rest.push(h);
          }
        }
        return { moved, backlog: rest };
      };

      let excludePick = excludeCandidatesAndPending(jd.candidates, pending);
      let { moved: fresh, backlog: backlogAfterPick } = pickFromBacklog(dailyAdd, excludePick);
      backlog = backlogAfterPick;

      if (fresh.length < dailyAdd) {
        if (!checkQuotaHasRemaining(authorId, 'recruitment_recommend', refillCost).allowed) {
          await prisma.jobPosting.update({
            where: { id: jd.id },
            data: { lastDailyRecommendAt: new Date() },
          });
          continue;
        }

        const excludeSearch = excludeCandidatesPendingAndBacklog(jd.candidates, pending, backlog);
        for (const h of fresh) {
          excludeSearch.add(h.githubUsername.trim().toLowerCase());
        }
        const combined = buildCombinedQueryFromJd(jd);
        const refillRequestId = randomUUID();
        railwayDiag({
          area: 'recruitment',
          event: 'daily.refill_search_start',
          jobPostingId: jd.id,
          authorId,
          requestId: refillRequestId,
          freshFromBacklog: fresh.length,
          dailyAdd,
        });
        const pack = await searchDevelopers(combined, new Map() as never, token, undefined, {
          requestId: refillRequestId,
          maxMergedCandidates: 1000,
          jobPostingId: jd.id,
          source: 'recruitment_daily',
        });
        railwayDiag({
          area: 'recruitment',
          event: 'daily.refill_search_done',
          jobPostingId: jd.id,
          requestId: refillRequestId,
          rawResultCount: pack.results.length,
        });

        const newBacklogPieces: RecruitmentRecommendHit[] = [];
        for (const r of pack.results) {
          const login = r.githubUsername.trim().toLowerCase();
          if (excludeSearch.has(login)) continue;
          excludeSearch.add(login);
          newBacklogPieces.push(mapDeveloperToRecommendHit(r, 'daily'));
        }

        if (newBacklogPieces.length > 0) {
          consumeQuota(authorId, 'recruitment_recommend', refillCost);
        }
        backlog = [...backlog, ...newBacklogPieces];

        const pendingPlusFresh = [...pending, ...fresh];
        excludePick = excludeCandidatesAndPending(jd.candidates, pendingPlusFresh);
        const second = pickFromBacklog(dailyAdd - fresh.length, excludePick);
        fresh = [...fresh, ...second.moved];
        backlog = second.backlog;
      }

      if (fresh.length > 0) {
        pending = [...pending, ...fresh];
        if (pending.length > pendingCap) {
          pending = pending.slice(pending.length - pendingCap);
        }
      }

      await prisma.jobPosting.update({
        where: { id: jd.id },
        data: {
          pendingRecommendHits: pending as object[],
          recommendBacklogHits: backlog as object[],
          lastDailyRecommendAt: new Date(),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      railwayDiag({
        area: 'recruitment',
        event: 'daily.jd_error',
        level: 'error',
        jobPostingId: jd.id,
        authorId,
        error: truncateDetail(msg),
        errorName: e instanceof Error ? e.name : undefined,
      });
      console.error('[recruitment] daily job jd', jd.id, e);
    }
  }
}

export function startRecruitmentDailyRecommendScheduler(): void {
  import('node-cron')
    .then(({ default: cron }) => {
      const expr = (process.env.RECRUIT_DAILY_CRON || '0 8 * * *').trim();
      if (!cron.validate(expr)) {
        railwayDiag({
          area: 'recruitment',
          event: 'daily.cron_invalid',
          level: 'error',
          expr,
        });
        console.warn('[recruitment] invalid RECRUIT_DAILY_CRON, skip scheduler:', expr);
        return;
      }
      cron.schedule(
        expr,
        () => {
          void runRecruitmentDailyRecommendJobs().catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            railwayDiag({
              area: 'recruitment',
              event: 'daily.scheduler_run_failed',
              level: 'error',
              error: truncateDetail(msg),
              errorName: err instanceof Error ? err.name : undefined,
            });
            console.error('[recruitment] daily scheduler', err);
          });
        },
        { timezone: process.env.RECRUIT_DAILY_TZ || 'Asia/Shanghai' },
      );
      console.log(
        '[recruitment] daily recommend scheduler:',
        expr,
        'tz=',
        process.env.RECRUIT_DAILY_TZ || 'Asia/Shanghai',
      );
    })
    .catch((e) => {
      railwayDiag({
        area: 'recruitment',
        event: 'daily.node_cron_load_failed',
        level: 'error',
        error: e instanceof Error ? truncateDetail(e.message) : String(e),
      });
      console.error('[recruitment] failed to load node-cron', e);
    });
}
