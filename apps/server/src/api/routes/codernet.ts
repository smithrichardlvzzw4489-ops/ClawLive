import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { crawlGitHubProfile, getServerGitHubToken, type GitHubCrawlResult } from '../../services/github-crawler';
import { analyzeGitHubProfile, type CodernetAnalysis } from '../../services/codernet-profile-analyzer';
import { crawlMultiPlatform, type MultiPlatformProfile } from '../../services/multiplatform-crawler';
import { searchDevelopers } from '../../services/codernet-search';
import {
  createConnectSession,
  getConnectSession,
  listConnectSessions,
  runConnectAgentRound,
  unlockHumanChat as unlockConnectHuman,
  postHumanMessage as postConnectHumanMessage,
  type ConnectProfile,
} from '../../services/codernet-connect';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  runCampaignPipeline,
  sendCampaign,
  pauseCampaign,
  previewMessage,
} from '../../services/codernet-outreach';
import { consumeQuota, checkQuota } from '../../services/quota-manager';
import {
  recordCodernetInterfaceUsage,
  recordCodernetPortraitShareUsage,
  type CodernetPortraitShareAction,
} from '../../services/codernet-interface-usage';
import {
  fetchSimilarGitHubUsers,
  fetchGitHubRelationPeople,
  type SimilarPersonRow,
  type RelationPersonRow,
} from '../../services/github-profile-graph';
import { getUserIdFromBearer } from '../middleware/auth';
import {
  resolveLinkedInProfileUrl,
  probeWebsiteForDeveloperIdentities,
} from '../../services/linkedin-resolve';
/* ── In-memory crawl progress tracker ─────────────────────── */
export type CrawlStage =
  | 'queued'
  | 'decrypting_token'
  | 'fetching_profile'
  | 'fetching_repos'
  | 'fetching_languages'
  | 'fetching_commits'
  | 'crawling_platforms'
  | 'analyzing_with_ai'
  | 'saving_results'
  | 'complete'
  | 'error';

export interface CrawlProgress {
  stage: CrawlStage;
  percent: number;
  detail: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

const crawlProgressMap = new Map<string, CrawlProgress>();

function setProgress(username: string, stage: CrawlStage, percent: number, detail: string, error?: string) {
  const existing = crawlProgressMap.get(username);
  crawlProgressMap.set(username, {
    stage,
    percent,
    detail,
    startedAt: existing?.startedAt || Date.now(),
    updatedAt: Date.now(),
    error,
  });
}

function clearProgress(username: string) {
  setTimeout(() => crawlProgressMap.delete(username), 60_000);
}

/* ── In-memory cache for public GitHub lookups ────────────── */
interface LookupCacheEntry {
  crawl: GitHubCrawlResult;
  analysis: CodernetAnalysis;
  multiPlatform?: MultiPlatformProfile;
  cachedAt: number;
  avatarUrl?: string;
}

/** 历史库里的 codernetAnalysis 可能含已下线的 jobSeekingInProfile，API 不再返回。 */
function analysisJsonForClient(stored: unknown): Record<string, unknown> {
  if (!stored || typeof stored !== 'object') return {};
  const { jobSeekingInProfile: _removed, ...rest } = stored as Record<string, unknown>;
  return rest;
}

const lookupCache = new Map<string, LookupCacheEntry>();
const LOOKUP_CACHE_TTL = 30 * 60 * 1000; // 30 min

const GRAPH_CACHE_TTL = 10 * 60 * 1000;
const similarPeopleCache = new Map<string, { at: number; people: SimilarPersonRow[] }>();
const relationsPeopleCache = new Map<string, { at: number; people: RelationPersonRow[] }>();

/** GET /api/codernet/github/:ghUsername — 与 Open API 共用 */
export async function handleCodernetGithubLookupGet(req: Request, res: Response): Promise<void> {
  try {
    const ghUser = req.params.ghUsername.toLowerCase();
    const traceId = (req.get('x-codernet-trace-id') || '').trim() || undefined;
    const logLookup = (outcome: string, extra?: Record<string, unknown>) => {
      if (!traceId) return;
      console.log(
        `[GITLINK] codernet-lookup ${JSON.stringify({ traceId, ghUser, outcome, ...extra })}`,
      );
    };

    const cached = lookupCache.get(ghUser);
    if (cached && Date.now() - cached.cachedAt < LOOKUP_CACHE_TTL) {
      logLookup('cache_hit');
      res.json({
        status: 'ready',
        crawl: cached.crawl,
        analysis: analysisJsonForClient(cached.analysis as unknown),
        multiPlatform: cached.multiPlatform || null,
        avatarUrl: cached.avatarUrl,
        cachedAt: cached.cachedAt,
      });
      return;
    }
    const progress = crawlProgressMap.get(`gh:${ghUser}`);
    if (progress) {
      logLookup('pending', { stage: progress.stage });
      res.json({ status: 'pending', progress });
      return;
    }
    logLookup('not_found');
    res.status(404).json({ status: 'not_found' });
  } catch (error) {
    console.error('[GITLINK] github lookup get error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}

/**
 * POST 触发公开 GitHub 画像爬取。
 * @param quotaUserId 非空时按该用户扣 profile_lookup 额度（JWT 或 Agent Key 所属用户）
 */
export async function handleCodernetGithubLookupPost(
  req: Request,
  res: Response,
  quotaUserId: string | null,
): Promise<void> {
  try {
    const ghUser = req.params.ghUsername.toLowerCase();

    const cached = lookupCache.get(ghUser);
    if (cached && Date.now() - cached.cachedAt < LOOKUP_CACHE_TTL) {
      res.json({ status: 'ready', message: 'Already cached.' });
      return;
    }

    const existing = crawlProgressMap.get(`gh:${ghUser}`);
    if (existing && existing.stage !== 'error' && existing.stage !== 'complete') {
      res.json({ status: 'already_running', message: 'Crawl already in progress.' });
      return;
    }

    if (quotaUserId) {
      const check = checkQuota(quotaUserId, 'profile_lookup');
      if (!check.allowed) {
        res.status(429).json({
          error: '本月画像生成额度已用完',
          code: 'QUOTA_EXCEEDED',
          quota: { dimension: 'profile_lookup', used: check.used, limit: check.limit, tier: check.tier },
        });
        return;
      }
      consumeQuota(quotaUserId, 'profile_lookup');
      void recordCodernetInterfaceUsage(quotaUserId, 'githubPortrait');
    }

    res.json({ status: 'started', message: 'Crawl started.' });

    runPublicLookup(ghUser).catch((err) => console.error('[GITLINK] public lookup failed:', err));
  } catch (error) {
    console.error('[GITLINK] github lookup post error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}

export function codernetRoutes(): IRouter {
  const router = Router();

  /**
   * GET /api/codernet/profile/:username
   * Public endpoint — returns GITLINK profile card data.
   */
  router.get('/profile/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          bio: true,
          githubId: true,
          githubUsername: true,
          githubProfileJson: true,
          codernetAnalysis: true,
          codernetCrawledAt: true,
          createdAt: true,
        },
      });

      if (!user || !user.githubId) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      if (!user.codernetAnalysis) {
        const progress = crawlProgressMap.get(username);
        return res.json({
          status: 'pending',
          user: {
            username: user.username,
            avatarUrl: user.avatarUrl,
            githubUsername: user.githubUsername,
          },
          message: 'Profile is being analyzed, check back shortly.',
          progress: progress || null,
        });
      }

      const crawl = user.githubProfileJson as Record<string, unknown> | null;
      const analysis = analysisJsonForClient(user.codernetAnalysis);

      res.json({
        status: 'ready',
        user: {
          username: user.username,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          githubUsername: user.githubUsername,
          memberSince: user.createdAt,
        },
        github: crawl
          ? {
              /** GitHub 登录名，与公开 lookup 页 crawl.username 一致 */
              username: String(crawl.username || user.githubUsername || ''),
              bio: (crawl.bio as string | null | undefined) ?? null,
              totalPublicRepos: crawl.totalPublicRepos,
              totalStars: crawl.totalStars,
              followers: crawl.followers,
              topRepos: (crawl.repos as Array<Record<string, unknown>> || []).slice(0, 6).map((r) => ({
                name: r.name,
                description: r.description,
                language: r.language,
                stars: r.stargazers_count,
                url: r.html_url,
              })),
              /** 全量样本仓库（可下钻），与爬取上限一致 */
              repos: (crawl.repos as Array<Record<string, unknown>> || []).map((r) => ({
                name: r.name,
                full_name: r.full_name,
                description: r.description,
                language: r.language,
                stars: r.stargazers_count,
                forks: r.forks_count,
                topics: r.topics,
                url: r.html_url,
                created_at: r.created_at,
                pushed_at: r.pushed_at,
              })),
              recentCommits: (crawl.recentCommits as Array<Record<string, unknown>> | undefined) || [],
              portfolioDepth: crawl.portfolioDepth ?? null,
              location: crawl.location,
              company: crawl.company,
              blog: crawl.blog,
              email: (crawl.email as string | null | undefined) ?? null,
              twitterUsername: (crawl.twitterUsername as string | null | undefined) ?? null,
            }
          : null,
        analysis,
        crawledAt: user.codernetCrawledAt,
      });
    } catch (error) {
      console.error('[GITLINK] profile fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  /**
   * POST /api/codernet/crawl
   * Authenticated — triggers re-crawl + re-analysis for current user.
   */
  router.post('/crawl', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          githubUsername: true,
          githubAccessToken: true,
          codernetCrawledAt: true,
        },
      });

      if (!user?.githubAccessToken || !user.githubUsername) {
        return res.status(400).json({
          error: 'NO_GITHUB',
          message: 'Please login with GitHub first to enable your GITLINK profile.',
        });
      }

      const cooldown = 5 * 60 * 1000;
      if (user.codernetCrawledAt && Date.now() - user.codernetCrawledAt.getTime() < cooldown) {
        return res.status(429).json({
          error: 'COOLDOWN',
          message: 'Please wait 5 minutes between crawls.',
          retryAfter: new Date(user.codernetCrawledAt.getTime() + cooldown),
        });
      }

      void recordCodernetInterfaceUsage(userId, 'minePortrait');

      res.json({ status: 'crawling', message: 'GitHub profile crawl started.' });

      runCrawlAndAnalysis(userId, user.githubAccessToken, user.githubUsername, user.username).catch((err) =>
        console.error('[GITLINK] background crawl failed:', err),
      );
    } catch (error) {
      console.error('[GITLINK] crawl trigger error:', error);
      res.status(500).json({ error: 'Failed to start crawl' });
    }
  });

  /**
   * GET /api/codernet/github/:ghUsername/similar
   * 基于当前缓存画像的语言栈在 GitHub 搜相似用户（最多 100），需先有 lookup 缓存。
   */
  router.get('/github/:ghUsername/similar', async (req: Request, res: Response) => {
    try {
      const ghUser = req.params.ghUsername.toLowerCase();
      const cached = lookupCache.get(ghUser);
      if (!cached?.crawl) {
        return res.status(404).json({
          error: 'NOT_READY',
          message: 'Profile not in server cache yet. Wait for the portrait to finish loading.',
        });
      }
      const hit = similarPeopleCache.get(ghUser);
      if (hit && Date.now() - hit.at < GRAPH_CACHE_TTL) {
        return res.json({ people: hit.people });
      }
      const token = getServerGitHubToken();
      const people = await fetchSimilarGitHubUsers(ghUser, cached.crawl, cached.analysis, token);
      similarPeopleCache.set(ghUser, { at: Date.now(), people });
      res.json({ people });
    } catch (e) {
      console.error('[GITLINK] github similar', e);
      res.status(500).json({
        error: 'SIMILAR_FAILED',
        message: e instanceof Error ? e.message : 'Failed to load similar users',
      });
    }
  });

  /**
   * GET /api/codernet/github/:ghUsername/relations
   * 聚合高星仓库 contributors 作为 GitHub 工程语境下的「关系」与连接度。
   */
  router.get('/github/:ghUsername/relations', async (req: Request, res: Response) => {
    try {
      const ghUser = req.params.ghUsername.toLowerCase();
      const cached = lookupCache.get(ghUser);
      if (!cached?.crawl?.repos?.length) {
        return res.status(404).json({
          error: 'NOT_READY',
          message: 'No repository data in cache yet.',
        });
      }
      const hit = relationsPeopleCache.get(ghUser);
      if (hit && Date.now() - hit.at < GRAPH_CACHE_TTL) {
        return res.json({ people: hit.people });
      }
      const token = getServerGitHubToken();
      const people = await fetchGitHubRelationPeople(ghUser, cached.crawl, token);
      relationsPeopleCache.set(ghUser, { at: Date.now(), people });
      res.json({ people });
    } catch (e) {
      console.error('[GITLINK] github relations', e);
      res.status(500).json({
        error: 'RELATIONS_FAILED',
        message: e instanceof Error ? e.message : 'Failed to load relations',
      });
    }
  });

  /**
   * GET /api/codernet/github/:ghUsername
   * Public — returns cached lookup result for any GitHub user.
   */
  router.get('/github/:ghUsername', handleCodernetGithubLookupGet);

  /**
   * POST /api/codernet/github/:ghUsername
   * Public — triggers crawl + analysis for any GitHub user (rate limited + quota).
   */
  router.post('/github/:ghUsername', (req: Request, res: Response) =>
    handleCodernetGithubLookupPost(req, res, getUserIdFromBearer(req)),
  );

  /**
   * POST /api/codernet/portrait-share
   * 已登录：GitHub 画像页「复制链接 / 下载长图 / 系统分享」各入口计数 +1（无额度消耗）。
   */
  router.post('/portrait-share', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const raw = (req.body as { action?: unknown })?.action;
      const action =
        raw === 'copyLink' || raw === 'downloadPng' || raw === 'nativeShare'
          ? (raw as CodernetPortraitShareAction)
          : null;
      if (!action) {
        return res.status(400).json({
          error: 'INVALID_ACTION',
          message: 'action must be copyLink, downloadPng, or nativeShare',
        });
      }
      const uid = req.user?.id;
      if (!uid) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      await recordCodernetPortraitShareUsage(uid, action);
      res.json({ ok: true });
    } catch (e) {
      console.error('[GITLINK] portrait-share', e);
      res.status(500).json({ error: 'portrait-share failed' });
    }
  });

  /* ── Developer Search ───────────────────────────────────── */

  /**
   * POST /api/codernet/search
   * Semantic search for developers by natural language description (quota-gated).
   */
  router.post('/search', async (req: Request, res: Response) => {
    try {
      const { query } = req.body as { query?: string };
      if (!query?.trim()) {
        return res.status(400).json({ error: 'query is required' });
      }

      // Quota check + consume
      const callerId = getUserIdFromBearer(req);
      if (callerId) {
        const check = checkQuota(callerId, 'search');
        if (!check.allowed) {
          return res.status(429).json({
            error: '本月搜索额度已用完',
            code: 'QUOTA_EXCEEDED',
            quota: { dimension: 'search', used: check.used, limit: check.limit, tier: check.tier },
          });
        }
        consumeQuota(callerId, 'search');
        void recordCodernetInterfaceUsage(callerId, 'linkSearch');
      }

      const token = getServerGitHubToken();
      const results = await searchDevelopers(query.trim(), lookupCache, token);
      res.json({ results });
    } catch (error) {
      console.error('[GITLINK] search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  /**
   * POST /api/codernet/linkedin/resolve
   * HR：粘贴 LinkedIn 个人主页 URL，尝试从公开 HTML 提取 GitHub / GitLab / 外链（无额度消耗）。
   */
  router.post('/linkedin/resolve', async (req: Request, res: Response) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'url is required' });
      }
      const result = await resolveLinkedInProfileUrl(url.trim());
      return res.json(result);
    } catch (e) {
      console.error('[GITLINK] linkedin/resolve error:', e);
      return res.status(500).json({ error: 'LinkedIn resolve failed' });
    }
  });

  /**
   * POST /api/codernet/linkedin/probe-website
   * 对个人网站再探测页内 GitHub 等链接（无额度消耗）。
   */
  router.post('/linkedin/probe-website', async (req: Request, res: Response) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'url is required' });
      }
      const hints = await probeWebsiteForDeveloperIdentities(url.trim());
      return res.json(hints);
    } catch (e) {
      console.error('[GITLINK] linkedin/probe-website error:', e);
      return res.status(500).json({ error: 'Probe failed' });
    }
  });

  /* ── GITLINK Connect (Agent pre-communication) ─────────── */

  /**
   * POST /api/codernet/connect
   * Creates a connect session between two developers. Agent chat starts immediately.
   */
  router.post('/connect', async (req: Request, res: Response) => {
    try {
      const { initiatorGhUsername, targetGhUsername, intent, intentCategory } = req.body as {
        initiatorGhUsername?: string;
        targetGhUsername?: string;
        intent?: string;
        intentCategory?: string;
      };
      if (!initiatorGhUsername || !targetGhUsername || !intent) {
        return res.status(400).json({ error: 'initiatorGhUsername, targetGhUsername, and intent are required' });
      }

      const initProfile = buildConnectProfile(initiatorGhUsername.toLowerCase());
      const targetProfile = buildConnectProfile(targetGhUsername.toLowerCase());

      if (!initProfile || !targetProfile) {
        return res.status(400).json({ error: 'Both developers must have GITLINK profiles. Generate their profiles first.' });
      }

      const session = createConnectSession(
        initProfile,
        targetProfile,
        intent.trim(),
        (intentCategory || '合作').trim(),
      );

      runConnectAgentRound(session.id).catch((err) =>
        console.error('[GITLINK-Connect] initial round failed:', err),
      );

      res.json({ session: sanitizeSession(session) });
    } catch (error) {
      console.error('[GITLINK] connect create error:', error);
      res.status(500).json({ error: 'Failed to create connect session' });
    }
  });

  /**
   * GET /api/codernet/connect/:id
   * Returns connect session details including agent messages.
   */
  router.get('/connect/:id', async (req: Request, res: Response) => {
    try {
      const session = getConnectSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json({ session: sanitizeSession(session) });
    } catch (error) {
      console.error('[GITLINK] connect get error:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  /**
   * POST /api/codernet/connect/:id/agent-step
   * Advances agent conversation by one round.
   */
  router.post('/connect/:id/agent-step', async (req: Request, res: Response) => {
    try {
      const session = await runConnectAgentRound(req.params.id);
      res.json({ session: sanitizeSession(session) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[GITLINK] agent step error:', error);
      res.status(400).json({ error: msg });
    }
  });

  /**
   * POST /api/codernet/connect/:id/unlock
   * Unlocks human chat after enough agent rounds.
   */
  router.post('/connect/:id/unlock', async (req: Request, res: Response) => {
    try {
      const session = unlockConnectHuman(req.params.id);
      res.json({ session: sanitizeSession(session) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: msg });
    }
  });

  /**
   * POST /api/codernet/connect/:id/human-message
   * Posts a human message to the connect session.
   */
  router.post('/connect/:id/human-message', async (req: Request, res: Response) => {
    try {
      const { body: msgBody, side } = req.body as { body?: string; side?: string };
      if (!msgBody?.trim()) return res.status(400).json({ error: 'body is required' });
      const authorSide = side === 'target' ? 'target' as const : 'initiator' as const;
      const session = postConnectHumanMessage(req.params.id, authorSide, msgBody.trim());
      res.json({ session: sanitizeSession(session) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: msg });
    }
  });

  /* ── Outreach Campaigns ──────────────────────────────────── */

  /**
   * POST /api/codernet/outreach/preview
   * Generates a preview message for one recipient (without creating a campaign).
   * MUST be registered before /outreach/:id routes to avoid `:id` matching "preview".
   */
  router.post('/outreach/preview', async (req: Request, res: Response) => {
    try {
      const { intent, senderName, senderInfo, recipientUsername, recipientProfile } = req.body as {
        intent?: string;
        senderName?: string;
        senderInfo?: string;
        recipientUsername?: string;
        recipientProfile?: any;
      };
      if (!intent || !senderName || !recipientUsername) {
        return res.status(400).json({ error: 'intent, senderName, and recipientUsername are required' });
      }
      const message = await previewMessage({
        intent,
        senderName,
        senderInfo: senderInfo || '',
        recipientUsername,
        recipientProfile,
      });
      res.json({ message });
    } catch (error) {
      console.error('[Outreach] preview error:', error);
      res.status(500).json({ error: 'Failed to generate preview' });
    }
  });

  /**
   * POST /api/codernet/outreach
   * Creates a new outreach campaign and starts the pipeline (quota-gated).
   */
  router.post('/outreach', async (req: Request, res: Response) => {
    try {
      const { searchQuery, githubQuery, intent, senderName, senderInfo, tierConfig } = req.body as {
        searchQuery?: string;
        githubQuery?: string;
        intent?: string;
        senderName?: string;
        senderInfo?: string;
        tierConfig?: { tier1?: number; tier2?: number; tier3?: number; tier4?: number };
      };
      if (!githubQuery || !intent || !senderName) {
        return res.status(400).json({ error: 'githubQuery, intent, and senderName are required' });
      }

      // Quota check for outreach
      const callerId = getUserIdFromBearer(req);
      if (callerId) {
        const check = checkQuota(callerId, 'outreach');
        if (!check.allowed) {
          return res.status(429).json({
            error: '本月触达额度已用完',
            code: 'QUOTA_EXCEEDED',
            quota: { dimension: 'outreach', used: check.used, limit: check.limit, tier: check.tier },
          });
        }
        consumeQuota(callerId, 'outreach');
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'clawlab.live';
      const profileBaseUrl = `${protocol}://${host}`;

      const campaign = createCampaign({
        searchQuery: searchQuery || githubQuery,
        githubQuery,
        intent,
        senderName,
        senderInfo: senderInfo || '',
        profileBaseUrl,
        tierConfig,
      });

      res.json({ campaign });

      const token = getServerGitHubToken();
      runCampaignPipeline(campaign.id, token).catch((err) =>
        console.error('[Outreach] pipeline error:', err),
      );
    } catch (error) {
      console.error('[Outreach] create error:', error);
      res.status(500).json({ error: 'Failed to create campaign' });
    }
  });

  /**
   * GET /api/codernet/outreach
   * Lists all outreach campaigns.
   */
  router.get('/outreach', async (_req: Request, res: Response) => {
    try {
      const all = listCampaigns().map(sanitizeCampaign);
      res.json({ campaigns: all });
    } catch (error) {
      console.error('[Outreach] list error:', error);
      res.status(500).json({ error: 'Failed to list campaigns' });
    }
  });

  /**
   * GET /api/codernet/outreach/:id
   * Returns a single campaign with all recipients.
   */
  router.get('/outreach/:id', async (req: Request, res: Response) => {
    try {
      const campaign = getCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      res.json({ campaign });
    } catch (error) {
      console.error('[Outreach] get error:', error);
      res.status(500).json({ error: 'Failed to get campaign' });
    }
  });

  /**
   * POST /api/codernet/outreach/:id/send
   * Starts sending emails for a ready campaign.
   */
  router.post('/outreach/:id/send', async (req: Request, res: Response) => {
    try {
      const { fromEmail } = req.body as { fromEmail?: string };
      if (!fromEmail) {
        return res.status(400).json({ error: 'fromEmail is required' });
      }
      const campaign = getCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      res.json({ status: 'sending', message: 'Email sending started' });

      sendCampaign(req.params.id, fromEmail).catch((err) =>
        console.error('[Outreach] send error:', err),
      );
    } catch (error) {
      console.error('[Outreach] send trigger error:', error);
      res.status(500).json({ error: 'Failed to start sending' });
    }
  });

  /**
   * POST /api/codernet/outreach/:id/pause
   * Pauses an active sending campaign.
   */
  router.post('/outreach/:id/pause', async (req: Request, res: Response) => {
    try {
      pauseCampaign(req.params.id);
      const campaign = getCampaign(req.params.id);
      res.json({ campaign: campaign ? sanitizeCampaign(campaign) : null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to pause campaign' });
    }
  });

  return router;
}

/* ── Helpers ──────────────────────────────────────────────── */

function sanitizeCampaign(c: any) {
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    searchQuery: c.searchQuery,
    githubQuery: c.githubQuery,
    intent: c.intent,
    senderName: c.senderName,
    status: c.status,
    totalFound: c.totalFound,
    recipientCount: c.recipients?.length || 0,
    progress: c.progress,
    tierConfig: c.tierConfig,
  };
}

/* ── Helpers for connect endpoints ────────────────────────── */

function buildConnectProfile(ghUsername: string): ConnectProfile | null {
  const cached = lookupCache.get(ghUsername);
  if (cached) {
    const a = cached.analysis;
    return {
      githubUsername: ghUsername,
      avatarUrl: cached.avatarUrl,
      oneLiner: a?.oneLiner,
      techTags: a?.techTags,
      sharpCommentary: a?.sharpCommentary,
      stats: cached.crawl ? {
        totalPublicRepos: cached.crawl.totalPublicRepos,
        totalStars: cached.crawl.totalStars,
        followers: cached.crawl.followers,
      } : undefined,
      bio: cached.crawl?.bio,
    };
  }
  return null;
}

function sanitizeSession(s: any) {
  return {
    id: s.id,
    initiatorGhUsername: s.initiatorGhUsername,
    targetGhUsername: s.targetGhUsername,
    intent: s.intent,
    intentCategory: s.intentCategory,
    status: s.status,
    initiatorProfile: s.initiatorProfile,
    targetProfile: s.targetProfile,
    agentMessages: s.agentMessages,
    humanMessages: s.humanMessages,
    agentRounds: s.agentRounds,
    agentVerdict: s.agentVerdict,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/**
 * Background crawl + analysis pipeline.
 * Called after GitHub login and on manual re-crawl.
 * Reports progress to the in-memory map for live polling.
 */
export async function runCrawlAndAnalysis(
  userId: string,
  encryptedToken: string,
  githubUsername: string,
  platformUsername?: string,
): Promise<void> {
  const trackKey = platformUsername || githubUsername;
  console.log(`[GITLINK] starting crawl for @${githubUsername} (user ${userId})`);

  setProgress(trackKey, 'queued', 0, 'Starting crawl pipeline...');

  let token: string;
  try {
    setProgress(trackKey, 'decrypting_token', 5, 'Decrypting access token...');
    token = decrypt(encryptedToken);
  } catch (err) {
    console.error('[GITLINK] token decrypt failed:', err);
    setProgress(trackKey, 'error', 5, 'Token decryption failed', String(err));
    clearProgress(trackKey);
    return;
  }

  try {
    setProgress(trackKey, 'fetching_profile', 10, 'Fetching GitHub profile...');
    const crawlData = await crawlGitHubProfile(token, githubUsername, (stage, detail) => {
      const stageMap: Record<string, [CrawlStage, number]> = {
        'fetching_repos': ['fetching_repos', 25],
        'fetching_languages': ['fetching_languages', 45],
        'fetching_commits': ['fetching_commits', 60],
      };
      const [s, p] = stageMap[stage] || ['fetching_profile', 15];
      setProgress(trackKey, s, p, detail);
    });

    console.log(
      `[GITLINK] crawled ${crawlData.repos.length} repos, ${Object.keys(crawlData.languageStats).length} languages for @${githubUsername}`,
    );

    setProgress(trackKey, 'saving_results', 65, 'Saving GitHub data...');
    await prisma.user.update({
      where: { id: userId },
      data: {
        githubProfileJson: crawlData as any,
        codernetCrawledAt: new Date(),
      },
    });

    setProgress(trackKey, 'crawling_platforms', 68, 'Scanning Stack Overflow, npm, PyPI, DEV.to...');
    let multiPlatform: MultiPlatformProfile | null = null;
    try {
      const repoNames = crawlData.repos.map((r) => r.name);
      multiPlatform = await crawlMultiPlatform(githubUsername, repoNames, token, (_platform, detail) => {
        setProgress(trackKey, 'crawling_platforms', 72, detail);
      });
    } catch (mpErr) {
      console.warn(`[GITLINK] multi-platform scan failed for @${githubUsername}:`, mpErr);
    }

    setProgress(trackKey, 'analyzing_with_ai', 78, 'AI is generating unified profile...');
    const analysis = await analyzeGitHubProfile(crawlData, multiPlatform);
    console.log(`[GITLINK] analysis complete for @${githubUsername}: "${analysis.oneLiner}" (platforms: ${analysis.platformsUsed.join(', ')})`);

    setProgress(trackKey, 'saving_results', 95, 'Saving analysis results...');
    await prisma.user.update({
      where: { id: userId },
      data: {
        codernetAnalysis: analysis as any,
      },
    });

    setProgress(trackKey, 'complete', 100, 'Profile ready!');
    clearProgress(trackKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GITLINK] crawl pipeline error for @${githubUsername}:`, err);
    setProgress(trackKey, 'error', 0, 'Crawl failed', msg);
    clearProgress(trackKey);
  }
}

/**
 * Public lookup: crawl any GitHub user without needing a platform account.
 * Uses GITHUB_SERVER_TOKEN / GITHUB_TOKEN / GH_TOKEN if set, otherwise unauthenticated (~60 req/hr per IP).
 */
async function runPublicLookup(ghUsername: string): Promise<void> {
  const trackKey = `gh:${ghUsername}`;
  console.log(`[GITLINK] public lookup for @${ghUsername}`);

  setProgress(trackKey, 'queued', 0, 'Starting public lookup...');

  const token = getServerGitHubToken();

  try {
    setProgress(trackKey, 'fetching_profile', 10, `Fetching @${ghUsername} profile...`);

    const crawlData = await crawlGitHubProfile(token, ghUsername, (stage, detail) => {
      const stageMap: Record<string, [CrawlStage, number]> = {
        'fetching_repos': ['fetching_repos', 25],
        'fetching_languages': ['fetching_languages', 45],
        'fetching_commits': ['fetching_commits', 60],
      };
      const [s, p] = stageMap[stage] || ['fetching_profile', 15];
      setProgress(trackKey, s, p, detail);
    });

    console.log(
      `[GITLINK] public lookup crawled ${crawlData.repos.length} repos for @${ghUsername}`,
    );

    setProgress(trackKey, 'crawling_platforms', 65, 'Scanning Stack Overflow, npm, PyPI, DEV.to...');
    let multiPlatform: MultiPlatformProfile | null = null;
    try {
      const repoNames = crawlData.repos.map((r) => r.name);
      multiPlatform = await crawlMultiPlatform(ghUsername, repoNames, token, (_platform, detail) => {
        setProgress(trackKey, 'crawling_platforms', 68, detail);
      });
      const foundPlatforms = [
        multiPlatform.stackOverflow ? 'SO' : null,
        multiPlatform.npmPackages.length ? 'npm' : null,
        multiPlatform.pypiPackages.length ? 'PyPI' : null,
        multiPlatform.devto ? 'DEV.to' : null,
        multiPlatform.huggingface ? 'HF' : null,
        multiPlatform.gitlab ? 'GitLab' : null,
        multiPlatform.leetcode ? 'LeetCode' : null,
        multiPlatform.kaggle ? 'Kaggle' : null,
        multiPlatform.codeforces ? 'CF' : null,
        multiPlatform.dockerhub?.repositories?.length ? 'Docker' : null,
        multiPlatform.cratesio?.crates?.length ? 'crates.io' : null,
      ].filter(Boolean);
      const graphInfo = multiPlatform.identityGraph
        ? ` | identity: ${multiPlatform.identityGraph.platforms.length} platforms, ${multiPlatform.identityGraph.links.length} links`
        : '';
      console.log(`[GITLINK] multi-platform scan for @${ghUsername}: found [${foundPlatforms.join(', ') || 'none'}]${graphInfo}`);
    } catch (mpErr) {
      console.warn(`[GITLINK] multi-platform scan failed for @${ghUsername}, continuing with GitHub only:`, mpErr);
    }

    setProgress(trackKey, 'analyzing_with_ai', 78, 'AI is generating the unified profile...');
    const analysis = await analyzeGitHubProfile(crawlData, multiPlatform);
    console.log(`[GITLINK] public lookup analysis complete for @${ghUsername}: "${analysis.oneLiner}" (platforms: ${analysis.platformsUsed.join(', ')})`);

    const avatarUrl = `https://github.com/${ghUsername}.png`;

    lookupCache.set(ghUsername, {
      crawl: crawlData,
      analysis,
      multiPlatform: multiPlatform || undefined,
      cachedAt: Date.now(),
      avatarUrl,
    });

    setProgress(trackKey, 'complete', 100, 'Profile ready!');
    clearProgress(trackKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GITLINK] public lookup error for @${ghUsername}:`, err);
    setProgress(trackKey, 'error', 0, 'Lookup failed', msg);
    clearProgress(trackKey);
  }
}
