import { Router, Response } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { checkQuota, consumeQuota } from '../../services/quota-manager';
import { concatExtractedFiles } from '../../services/math-ingest';
import { runJdResumeMatchAnalysis } from '../../services/jd-resume-match';
import type { CrawlProgress } from './codernet';
import { getGithubPortraitBundleForMatch, getPublicGithubCrawlProgress, runPublicLookup } from './codernet';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function awaitRunPublicLookupWithProgress(
  gh: string,
  onProgress: (p: CrawlProgress | null) => void,
): Promise<void> {
  const tick = () => onProgress(getPublicGithubCrawlProgress(gh));
  tick();
  const timer = setInterval(tick, 1200);
  try {
    await runPublicLookup(gh);
  } finally {
    clearInterval(timer);
    tick();
    onProgress(null);
  }
}

/**
 * 任意公开 GitHub 用户：优先读缓存/库；若正在爬取则短暂等待；否则自动触发公开爬取并等待完成。
 * onGithubProgress 在轮询/爬取过程中回调，便于 SSE 推送细粒度进度。
 */
async function resolveGithubPortraitForMath(
  githubUsername: string,
  onGithubProgress?: (p: CrawlProgress | null) => void,
): Promise<
  | { ok: true; portraitSummary: string; githubLogin: string }
  | { ok: false; message: string; code?: string }
> {
  const gh = githubUsername.trim().toLowerCase().replace(/^@/, '');
  if (!gh) {
    return { ok: false, message: 'GitHub 登录名为空', code: 'INVALID' };
  }

  let r = await getGithubPortraitBundleForMatch(gh);
  if (r.ok) {
    return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
  }

  if (r.code === 'PENDING') {
    for (let i = 0; i < 70; i++) {
      onGithubProgress?.(getPublicGithubCrawlProgress(gh));
      await sleep(2000);
      r = await getGithubPortraitBundleForMatch(gh);
      if (r.ok) {
        onGithubProgress?.(null);
        return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
      }
      if (r.code === 'NOT_FOUND') break;
    }
  }

  r = await getGithubPortraitBundleForMatch(gh);
  if (r.ok) {
    onGithubProgress?.(null);
    return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
  }

  await awaitRunPublicLookupWithProgress(gh, (p) => onGithubProgress?.(p));
  r = await getGithubPortraitBundleForMatch(gh);
  if (r.ok) {
    return { ok: true, portraitSummary: r.portraitSummary, githubLogin: r.githubLogin };
  }

  return {
    ok: false,
    message:
      '无法获取该 GitHub 用户的公开画像。请确认登录名正确、主要仓库为公开，或稍后重试（匿名 API 可能被限流）。',
    code: 'GITHUB_FETCH_FAILED',
  };
}

function sseWrite(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

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
          const gh = await resolveGithubPortraitForMath(githubUsername);
          if (!gh.ok) {
            const status = gh.code === 'INVALID' ? 400 : 502;
            res.status(status).json({
              error: gh.message,
              code: gh.code ?? 'GITHUB_FETCH_FAILED',
              githubLogin: githubUsername,
            });
            return;
          }
          githubPortraitSummary = gh.portraitSummary;
        }

        if (!resumeCombined && !githubPortraitSummary) {
          res.status(400).json({ error: '请填写或上传简历，或填写 GitHub 登录名以拉取公开画像' });
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

  router.post(
    '/match-stream',
    authenticateToken,
    upload.fields([
      { name: 'jdFiles', maxCount: 8 },
      { name: 'resumeFiles', maxCount: 8 },
    ]),
    async (req: AuthRequest, res: Response) => {
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

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

      const finish = () => {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      };

      try {
        sseWrite(res, { phase: 'ingest', message: '正在解析 JD 与简历附件（含 PDF / Word / 图片等）…' });

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

        sseWrite(res, {
          phase: 'ingest_done',
          jdChars: jdCombined.length,
          resumeChars: resumeCombined.length,
        });

        if (!jdCombined) {
          sseWrite(res, { phase: 'error', error: '请填写或上传职位 JD 正文', code: 'VALIDATION' });
          finish();
          return;
        }

        if (jdCombined.length + resumeCombined.length > MAX_COMBINED) {
          sseWrite(res, { phase: 'error', error: 'JD 与简历合并长度过长，请删减或分次匹配', code: 'VALIDATION' });
          finish();
          return;
        }

        let githubPortraitSummary = '';
        if (githubUsername) {
          sseWrite(res, {
            phase: 'github',
            message: '正在拉取 GitHub 公开画像（首次可能 1～3 分钟）…',
            progress: getPublicGithubCrawlProgress(githubUsername),
          });
          const gh = await resolveGithubPortraitForMath(githubUsername, (p) => {
            sseWrite(res, { phase: 'github', progress: p });
          });
          if (!gh.ok) {
            sseWrite(res, {
              phase: 'error',
              error: gh.message,
              code: gh.code ?? 'GITHUB_FETCH_FAILED',
            });
            finish();
            return;
          }
          githubPortraitSummary = gh.portraitSummary;
          sseWrite(res, { phase: 'github_done' });
        }

        if (!resumeCombined && !githubPortraitSummary) {
          sseWrite(res, {
            phase: 'error',
            error: '请填写或上传简历，或填写 GitHub 登录名以拉取公开画像',
            code: 'VALIDATION',
          });
          finish();
          return;
        }

        sseWrite(res, { phase: 'llm', message: '正在由 LLM 对照 JD 与候选人材料，生成分项与综合匹配度…' });

        const result = await runJdResumeMatchAnalysis({
          jdText: jdCombined,
          resumeText: resumeCombined,
          githubPortraitSummary,
        });

        consumeQuota(userId, 'jd_resume_match', 1);

        sseWrite(res, {
          phase: 'done',
          result,
          meta: {
            jdChars: jdCombined.length,
            resumeChars: resumeCombined.length,
            githubUsed: Boolean(githubUsername),
          },
        });
      } catch (e) {
        console.error('[math/match-stream]', e);
        const msg = e instanceof Error ? e.message : '匹配失败';
        sseWrite(res, { phase: 'error', error: msg, code: 'INTERNAL' });
      }
      finish();
    },
  );

  return router;
}
