import { Router, Response } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { checkQuota, consumeQuota } from '../../services/quota-manager';
import { concatExtractedFiles } from '../../services/math-ingest';
import { runJdResumeMatchAnalysis } from '../../services/jd-resume-match';
import { getGithubPortraitBundleForMatch } from './codernet';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 20 },
});

const MAX_COMBINED = 90_000;

export function mathRoutes(): Router {
  const router = Router();

  router.post(
    '/match',
    authenticateToken,
    upload.fields([
      { name: 'jdFiles', maxCount: 8 },
      { name: 'resumeFiles', maxCount: 8 },
    ]),
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const q = checkQuota(userId, 'jd_resume_match');
        if (!q.allowed) {
          res.status(429).json({
            error: '本月 Math 匹配次数已用完',
            code: 'QUOTA_EXCEEDED',
            quota: { dimension: 'jd_resume_match', used: q.used, limit: q.limit, tier: q.tier },
          });
          return;
        }

        const body = req.body as { jdText?: unknown; resumeText?: unknown; githubUsername?: unknown };
        const jdTextRaw = typeof body.jdText === 'string' ? body.jdText.trim() : '';
        const resumeTextRaw = typeof body.resumeText === 'string' ? body.resumeText.trim() : '';
        const githubUsername =
          typeof body.githubUsername === 'string' ? body.githubUsername.trim().replace(/^@/, '') : '';

        const files = req.files as { jdFiles?: Express.Multer.File[]; resumeFiles?: Express.Multer.File[] };
        const jdFromFiles = await concatExtractedFiles(files?.jdFiles, 'JD 附件');
        const resumeFromFiles = await concatExtractedFiles(files?.resumeFiles, '简历附件');

        const jdCombined = [jdTextRaw, jdFromFiles].filter(Boolean).join('\n\n').trim();
        const resumeCombined = [resumeTextRaw, resumeFromFiles].filter(Boolean).join('\n\n').trim();

        if (!jdCombined) {
          res.status(400).json({ error: '请填写或上传职位 JD 正文' });
          return;
        }

        if (jdCombined.length + resumeCombined.length > MAX_COMBINED) {
          res.status(400).json({ error: 'JD 与简历合并长度过长，请删减或分次匹配' });
          return;
        }

        let githubPortraitSummary = '';
        if (githubUsername) {
          const gh = await getGithubPortraitBundleForMatch(githubUsername);
          if (!gh.ok) {
            const status = gh.code === 'PENDING' ? 409 : 400;
            res.status(status).json({
              error: gh.message,
              code: gh.code,
              githubLogin: githubUsername,
            });
            return;
          }
          githubPortraitSummary = gh.portraitSummary;
        }

        if (!resumeCombined && !githubPortraitSummary) {
          res.status(400).json({ error: '请填写或上传简历，或填写已爬取过的 GitHub 登录名' });
          return;
        }

        const result = await runJdResumeMatchAnalysis({
          jdText: jdCombined,
          resumeText: resumeCombined,
          githubPortraitSummary,
        });

        consumeQuota(userId, 'jd_resume_match', 1);

        res.json({
          result,
          meta: {
            jdChars: jdCombined.length,
            resumeChars: resumeCombined.length,
            githubUsed: Boolean(githubUsername),
          },
        });
      } catch (e) {
        console.error('[math/match]', e);
        const msg = e instanceof Error ? e.message : '匹配失败';
        res.status(500).json({ error: msg });
      }
    },
  );

  return router;
}
