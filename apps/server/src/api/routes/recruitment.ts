import { Router, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { prisma } from "../../lib/prisma";
import { checkQuotaHasRemaining, consumeQuota } from "../../services/quota-manager";
import { searchDevelopers } from "../../services/codernet-search";
import { getServerGitHubToken } from "../../services/github-crawler";
import { extractTextFromUpload } from "../../services/attachment-text-ingest";
import { notifyMatchedUsersForJobPosting } from "../../services/job-plaza-notify";
import {
  buildCombinedQueryFromJd,
  mapDeveloperToRecommendHit,
  parsePendingRecommendHits,
  RECRUIT_FIRST_RECOMMEND_QUOTA_COST,
  RECRUIT_MANUAL_RECOMMEND_QUOTA_COST,
} from "../../services/recruitment-recommend";

const MAX_TITLE = 200;
const MAX_BODY = 50_000;
const MAX_TAG = 40;
const MAX_TAGS = 24;

const jdBodyFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});
const PIPELINE_STAGES = [
  "新建",
  "沟通中",
  "面试中",
  "已发Offer",
  "已入职",
  "已拒绝",
  "暂不联系",
] as const;

function parseMatchTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is string => typeof x === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS)
      .map((t) => (t.length > MAX_TAG ? t.slice(0, MAX_TAG) : t));
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,，、\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS)
      .map((t) => (t.length > MAX_TAG ? t.slice(0, MAX_TAG) : t));
  }
  return [];
}

function normGh(u: string): string {
  return u.trim().replace(/^@/, "").toLowerCase();
}

function serializeJd(row: {
  id: string;
  authorId: string;
  title: string;
  companyName: string | null;
  location: string | null;
  body: string;
  matchTags: unknown;
  status: string;
  publishedAt: Date | null;
  firstRecommendAt?: Date | null;
  lastWeeklyRecommendAt?: Date | null;
  pendingRecommendHits?: unknown;
  createdAt: Date;
  updatedAt: Date;
  candidates?: {
    id: string;
    githubUsername: string;
    displayName: string | null;
    email: string | null;
    notes: string | null;
    pipelineStage: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
}) {
  const tags = Array.isArray(row.matchTags)
    ? row.matchTags.filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    companyName: row.companyName,
    location: row.location,
    body: row.body,
    matchTags: tags,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    firstRecommendAt: row.firstRecommendAt?.toISOString() ?? null,
    lastWeeklyRecommendAt: row.lastWeeklyRecommendAt?.toISOString() ?? null,
    pendingRecommendCount: parsePendingRecommendHits(row.pendingRecommendHits).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    candidates: (row.candidates || []).map((c) => ({
      id: c.id,
      githubUsername: c.githubUsername,
      displayName: c.displayName,
      email: c.email,
      notes: c.notes,
      pipelineStage: c.pipelineStage,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

export function recruitmentRoutes(): Router {
  const router = Router();

  router.get("/pipeline-stages", authenticateToken, (_req: AuthRequest, res: Response) => {
    res.json({ stages: [...PIPELINE_STAGES] });
  });

  router.get("/jds", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const rows = await prisma.jobPosting.findMany({
        where: { authorId: userId },
        orderBy: { updatedAt: "desc" },
        take: 200,
        include: {
          candidates: { orderBy: { updatedAt: "desc" } },
        },
      });
      res.json({ items: rows.map((r) => serializeJd(r)) });
    } catch (e) {
      console.error("[recruitment] list jds", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  router.post(
    "/jds/extract-text",
    authenticateToken,
    jdBodyFileUpload.single("file"),
    async (req: AuthRequest, res: Response) => {
      try {
        const f = req.file;
        if (!f?.buffer?.length) {
          res.status(400).json({ error: "请选择文件" });
          return;
        }
        const text = (await extractTextFromUpload(f)).trim();
        if (!text) {
          res.status(400).json({
            error: "未能从文件中提取文字。请使用 .txt / .md / .docx / .pdf，或直接粘贴正文。",
          });
          return;
        }
        if (text.length > MAX_BODY) {
          res.status(400).json({ error: `提取的正文过长（>${MAX_BODY} 字），请精简后重试` });
          return;
        }
        res.json({ text });
      } catch (e) {
        console.error("[recruitment] extract jd file", e);
        res.status(500).json({ error: "解析失败" });
      }
    },
  );

  router.post("/jds", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const companyName =
        typeof req.body?.companyName === "string" ? req.body.companyName.trim() || null : null;
      const location = typeof req.body?.location === "string" ? req.body.location.trim() || null : null;
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      let matchTags = parseMatchTags(req.body?.matchTags);
      if (matchTags.length === 0) matchTags = ["招聘管理"];

      if (!title || title.length > MAX_TITLE) {
        res.status(400).json({ error: "标题必填且不宜过长" });
        return;
      }
      if (!body) {
        res.status(400).json({ error: "职位描述必填" });
        return;
      }
      if (body.length > MAX_BODY) {
        res.status(400).json({ error: "正文过长" });
        return;
      }

      const publishedAt = new Date();
      const row = await prisma.jobPosting.create({
        data: {
          authorId: userId,
          title,
          companyName,
          location,
          body,
          matchTags,
          status: "published",
          publishedAt,
        },
        include: { candidates: true },
      });
      try {
        await notifyMatchedUsersForJobPosting(prisma, row.id, userId, {
          title,
          companyName,
          location,
          body,
          matchTags,
        });
      } catch (notifyErr) {
        console.error("[recruitment] notify on jd create", notifyErr);
      }
      res.status(201).json({ jd: serializeJd(row) });
    } catch (e) {
      console.error("[recruitment] create jd", e);
      res.status(500).json({ error: "创建失败" });
    }
  });

  router.get("/jds/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const row = await prisma.jobPosting.findFirst({
        where: { id: req.params.id, authorId: userId },
        include: { candidates: { orderBy: { updatedAt: "desc" } } },
      });
      if (!row) {
        res.status(404).json({ error: "未找到" });
        return;
      }
      res.json({ jd: serializeJd(row) });
    } catch (e) {
      console.error("[recruitment] get jd", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  router.patch("/jds/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const existing = await prisma.jobPosting.findFirst({ where: { id, authorId: userId } });
      if (!existing) {
        res.status(404).json({ error: "未找到" });
        return;
      }
      if (existing.status === "closed") {
        res.status(400).json({ error: "已关闭的职位不可编辑" });
        return;
      }

      const patch: {
        title?: string;
        companyName?: string | null;
        location?: string | null;
        body?: string;
        matchTags?: string[];
      } = {};

      if (typeof req.body?.title === "string") {
        const t = req.body.title.trim();
        if (!t || t.length > MAX_TITLE) {
          res.status(400).json({ error: "标题无效" });
          return;
        }
        patch.title = t;
      }
      if (typeof req.body?.companyName === "string") patch.companyName = req.body.companyName.trim() || null;
      if (typeof req.body?.location === "string") patch.location = req.body.location.trim() || null;
      if (typeof req.body?.body === "string") {
        const b = req.body.body.trim();
        if (!b || b.length > MAX_BODY) {
          res.status(400).json({ error: "正文无效或过长" });
          return;
        }
        patch.body = b;
      }
      if (req.body?.matchTags !== undefined) {
        const tags = parseMatchTags(req.body.matchTags);
        if (tags.length === 0) {
          res.status(400).json({ error: "至少填写一个匹配标签，或使用默认" });
          return;
        }
        patch.matchTags = tags;
      }

      const row = await prisma.jobPosting.update({
        where: { id },
        data: patch,
        include: { candidates: true },
      });
      res.json({ jd: serializeJd(row) });
    } catch (e) {
      console.error("[recruitment] patch jd", e);
      res.status(500).json({ error: "更新失败" });
    }
  });

  router.delete("/jds/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const existing = await prisma.jobPosting.findFirst({ where: { id, authorId: userId } });
      if (!existing) {
        res.status(404).json({ error: "未找到" });
        return;
      }
      await prisma.jobPosting.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      console.error("[recruitment] delete jd", e);
      res.status(500).json({ error: "删除失败" });
    }
  });

  router.post("/jds/:id/candidates", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const jobPostingId = req.params.id;
      const jd = await prisma.jobPosting.findFirst({ where: { id: jobPostingId, authorId: userId } });
      if (!jd) {
        res.status(404).json({ error: "未找到 JD" });
        return;
      }
      const githubUsername = normGh(typeof req.body?.githubUsername === "string" ? req.body.githubUsername : "");
      if (!githubUsername) {
        res.status(400).json({ error: "请填写 GitHub 用户名" });
        return;
      }
      const displayName =
        typeof req.body?.displayName === "string" ? req.body.displayName.trim() || null : null;
      const email = typeof req.body?.email === "string" ? req.body.email.trim() || null : null;
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null;
      let pipelineStage =
        typeof req.body?.pipelineStage === "string" ? req.body.pipelineStage.trim() : "新建";
      if (!PIPELINE_STAGES.includes(pipelineStage as (typeof PIPELINE_STAGES)[number])) {
        pipelineStage = "新建";
      }

      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.jobPostingCandidate.create({
          data: {
            jobPostingId,
            githubUsername,
            displayName,
            email,
            notes,
            pipelineStage,
          },
        });
        const pending = parsePendingRecommendHits(jd.pendingRecommendHits).filter(
          (h) => h.githubUsername.trim().toLowerCase() !== githubUsername.toLowerCase(),
        );
        await tx.jobPosting.update({
          where: { id: jobPostingId },
          data: { pendingRecommendHits: pending as object[] },
        });
        return created;
      });
      res.status(201).json({
        candidate: {
          id: row.id,
          githubUsername: row.githubUsername,
          displayName: row.displayName,
          email: row.email,
          notes: row.notes,
          pipelineStage: row.pipelineStage,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
        res.status(409).json({ error: "该 JD 下已存在相同 GitHub 候选人" });
        return;
      }
      console.error("[recruitment] add candidate", e);
      res.status(500).json({ error: "添加失败" });
    }
  });

  router.patch("/jds/:id/candidates/:cid", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id: jobPostingId, cid } = req.params;
      const jd = await prisma.jobPosting.findFirst({ where: { id: jobPostingId, authorId: userId } });
      if (!jd) {
        res.status(404).json({ error: "未找到 JD" });
        return;
      }
      const existing = await prisma.jobPostingCandidate.findFirst({
        where: { id: cid, jobPostingId },
      });
      if (!existing) {
        res.status(404).json({ error: "未找到候选人" });
        return;
      }

      const data: {
        displayName?: string | null;
        email?: string | null;
        notes?: string | null;
        pipelineStage?: string;
      } = {};
      if (typeof req.body?.displayName === "string") data.displayName = req.body.displayName.trim() || null;
      if (typeof req.body?.email === "string") data.email = req.body.email.trim() || null;
      if (typeof req.body?.notes === "string") data.notes = req.body.notes.trim() || null;
      if (typeof req.body?.pipelineStage === "string") {
        const s = req.body.pipelineStage.trim();
        if (PIPELINE_STAGES.includes(s as (typeof PIPELINE_STAGES)[number])) {
          data.pipelineStage = s;
        }
      }

      const row = await prisma.jobPostingCandidate.update({
        where: { id: cid },
        data,
      });
      res.json({
        candidate: {
          id: row.id,
          githubUsername: row.githubUsername,
          displayName: row.displayName,
          email: row.email,
          notes: row.notes,
          pipelineStage: row.pipelineStage,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      console.error("[recruitment] patch candidate", e);
      res.status(500).json({ error: "更新失败" });
    }
  });

  router.delete("/jds/:id/candidates/:cid", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id: jobPostingId, cid } = req.params;
      const jd = await prisma.jobPosting.findFirst({ where: { id: jobPostingId, authorId: userId } });
      if (!jd) {
        res.status(404).json({ error: "未找到 JD" });
        return;
      }
      const existing = await prisma.jobPostingCandidate.findFirst({
        where: { id: cid, jobPostingId },
      });
      if (!existing) {
        res.status(404).json({ error: "未找到候选人" });
        return;
      }
      await prisma.jobPostingCandidate.delete({ where: { id: cid } });
      res.json({ ok: true });
    } catch (e) {
      console.error("[recruitment] delete candidate", e);
      res.status(500).json({ error: "删除失败" });
    }
  });

  /** 周更写入的待查看推荐池（不扣额度） */
  router.get("/jds/:id/recommend-queue", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const jd = await prisma.jobPosting.findFirst({ where: { id, authorId: userId } });
      if (!jd) {
        res.status(404).json({ error: "未找到 JD" });
        return;
      }
      const pending = parsePendingRecommendHits(jd.pendingRecommendHits);
      res.json({
        pending,
        firstRecommendAt: jd.firstRecommendAt?.toISOString() ?? null,
        lastWeeklyRecommendAt: jd.lastWeeklyRecommendAt?.toISOString() ?? null,
      });
    } catch (e) {
      console.error("[recruitment] recommend-queue", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  /**
   * 与 LINK 相同流水线，但扣 **recruitment_recommend**（与 GITLINK 三入口的 gitlink_* 分离）。
   * 首次：多结果、高扣点；之后：小批次；周更后台由 `runRecruitmentWeeklyRecommendJobs` 写入 pending。
   */
  router.post("/jds/:id/recommend", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const jd = await prisma.jobPosting.findFirst({ where: { id, authorId: userId } });
      if (!jd) {
        res.status(404).json({ error: "未找到 JD" });
        return;
      }

      const isFirst = jd.firstRecommendAt == null;
      const quotaCost = isFirst ? RECRUIT_FIRST_RECOMMEND_QUOTA_COST() : RECRUIT_MANUAL_RECOMMEND_QUOTA_COST();
      const quotaCheck = checkQuotaHasRemaining(userId, "recruitment_recommend", quotaCost);
      if (!quotaCheck.allowed) {
        res.status(429).json({
          error:
            quotaCheck.limit <= 0
              ? "当前账号未配置招聘推荐额度，请联系管理员。"
              : "本月招聘推荐额度已用完，请下月重置或升级套餐。",
          code: "QUOTA_EXCEEDED",
          quota: {
            dimension: "recruitment_recommend",
            used: quotaCheck.used,
            limit: quotaCheck.limit,
            tier: quotaCheck.tier,
            required: quotaCost,
          },
        });
        return;
      }

      const ridRaw = req.get("x-request-id")?.trim();
      const pipelineRequestId =
        ridRaw && ridRaw.length >= 4 && ridRaw.length <= 128 && !/[\r\n]/.test(ridRaw)
          ? ridRaw.slice(0, 128)
          : randomUUID();

      const token = getServerGitHubToken();
      const combinedQuery = buildCombinedQueryFromJd(jd);
      const pack = await searchDevelopers(combinedQuery, new Map() as never, token, undefined, {
        requestId: pipelineRequestId,
      });

      const raw = pack.results;
      const clientLimit = parseInt(String((req.body as { limit?: unknown })?.limit ?? ""), 10);
      const defaultLimit = isFirst ? 40 : 10;
      let limit = Number.isFinite(clientLimit) ? clientLimit : defaultLimit;
      limit = Math.min(isFirst ? 55 : 15, Math.max(isFirst ? 18 : 5, limit));

      const results = raw.slice(0, limit).map((r) => mapDeveloperToRecommendHit(r, "sync"));

      consumeQuota(userId, "recruitment_recommend", quotaCost);

      if (isFirst) {
        await prisma.jobPosting.update({
          where: { id },
          data: { firstRecommendAt: new Date() },
        });
      }

      res.json({
        results,
        meta: {
          jdId: id,
          count: results.length,
          quotaCost,
          isFirstRecommend: isFirst,
          hint: isFirst
            ? "首次推荐已按大额扣点返回较多结果；之后手动点击为小批次。系统每周还会向「待查看池」缓慢补充（见上方接口 recommend-queue）。"
            : "手动刷新为小批次；周更推荐请在「待查看池」查看。",
        },
      });
    } catch (e) {
      console.error("[recruitment] recommend", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "推荐失败",
        code: "RECOMMEND_FAILED",
      });
    }
  });

  return router;
}
