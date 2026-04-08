import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { crawlGitHubProfile } from '../../services/github-crawler';
import { analyzeGitHubProfile } from '../../services/codernet-profile-analyzer';

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
        return res.json({
          status: 'pending',
          user: {
            username: user.username,
            avatarUrl: user.avatarUrl,
            githubUsername: user.githubUsername,
          },
          message: 'Profile is being analyzed, check back shortly.',
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

      runCrawlAndAnalysis(userId, user.githubAccessToken, user.githubUsername).catch((err) =>
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
 */
export async function runCrawlAndAnalysis(
  userId: string,
  encryptedToken: string,
  githubUsername: string,
): Promise<void> {
  console.log(`[Codernet] starting crawl for @${githubUsername} (user ${userId})`);

  let token: string;
  try {
    token = decrypt(encryptedToken);
  } catch (err) {
    console.error('[Codernet] token decrypt failed:', err);
    return;
  }

  const crawlData = await crawlGitHubProfile(token, githubUsername);
  console.log(
    `[Codernet] crawled ${crawlData.repos.length} repos, ${Object.keys(crawlData.languageStats).length} languages for @${githubUsername}`,
  );

  await prisma.user.update({
    where: { id: userId },
    data: {
      githubProfileJson: crawlData as any,
      codernetCrawledAt: new Date(),
    },
  });

  const analysis = await analyzeGitHubProfile(crawlData);
  console.log(`[Codernet] analysis complete for @${githubUsername}: "${analysis.oneLiner}"`);

  await prisma.user.update({
    where: { id: userId },
    data: {
      codernetAnalysis: analysis as any,
    },
  });
}
