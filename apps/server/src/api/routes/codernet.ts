import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { crawlGitHubProfile } from '../../services/github-crawler';
import { analyzeGitHubProfile } from '../../services/codernet-profile-analyzer';

/* ── In-memory crawl progress tracker ─────────────────────── */
export type CrawlStage =
  | 'queued'
  | 'decrypting_token'
  | 'fetching_profile'
  | 'fetching_repos'
  | 'fetching_languages'
  | 'fetching_commits'
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

export function codernetRoutes(): IRouter {
  const router = Router();

  /**
   * GET /api/codernet/profile/:username
   * Public endpoint — returns Codernet profile card data.
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
        return res.status(404).json({ error: 'Codernet profile not found' });
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
      const analysis = user.codernetAnalysis as Record<string, unknown>;

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
              location: crawl.location,
              company: crawl.company,
              blog: crawl.blog,
            }
          : null,
        analysis,
        crawledAt: user.codernetCrawledAt,
      });
    } catch (error) {
      console.error('[Codernet] profile fetch error:', error);
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
          message: 'Please login with GitHub first to enable Codernet profile.',
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

      res.json({ status: 'crawling', message: 'GitHub profile crawl started.' });

      runCrawlAndAnalysis(userId, user.githubAccessToken, user.githubUsername, user.username).catch((err) =>
        console.error('[Codernet] background crawl failed:', err),
      );
    } catch (error) {
      console.error('[Codernet] crawl trigger error:', error);
      res.status(500).json({ error: 'Failed to start crawl' });
    }
  });

  return router;
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
  console.log(`[Codernet] starting crawl for @${githubUsername} (user ${userId})`);

  setProgress(trackKey, 'queued', 0, 'Starting crawl pipeline...');

  let token: string;
  try {
    setProgress(trackKey, 'decrypting_token', 5, 'Decrypting access token...');
    token = decrypt(encryptedToken);
  } catch (err) {
    console.error('[Codernet] token decrypt failed:', err);
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
      `[Codernet] crawled ${crawlData.repos.length} repos, ${Object.keys(crawlData.languageStats).length} languages for @${githubUsername}`,
    );

    setProgress(trackKey, 'saving_results', 70, 'Saving GitHub data...');
    await prisma.user.update({
      where: { id: userId },
      data: {
        githubProfileJson: crawlData as any,
        codernetCrawledAt: new Date(),
      },
    });

    setProgress(trackKey, 'analyzing_with_ai', 75, 'AI is analyzing your code style...');
    const analysis = await analyzeGitHubProfile(crawlData);
    console.log(`[Codernet] analysis complete for @${githubUsername}: "${analysis.oneLiner}"`);

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
    console.error(`[Codernet] crawl pipeline error for @${githubUsername}:`, err);
    setProgress(trackKey, 'error', 0, 'Crawl failed', msg);
    clearProgress(trackKey);
  }
}
