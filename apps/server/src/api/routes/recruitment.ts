import { Router, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { prisma } from "../../lib/prisma";
import { checkQuota, consumeQuota } from "../../services/quota-manager";
import { searchDevelopers } from "../../services/codernet-search";
import { getServerGitHubToken } from "../../services/github-crawler";
import { extractTextFromUpload } from "../../services/attachment-text-ingest";

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

      const row = await prisma.jobPosting.create({
        data: {
          authorId: userId,
          title,
          companyName,
          location,
          body,
          matchTags,
          status: "draft",
          publishedAt: null,
        },
        include: { candidates: true },
      });
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

      const row = await prisma.jobPostingCandidate.create({
        data: {
          jobPostingId,
          githubUsername,
          displayName,
          email,
          notes,
          pipelineStage,
        },
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

  /** 基于 JD 正文与标签，调用与 LINK 相同的语义搜人（扣 search 额度） */
  router.post("/jds/:id/recommend", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const jd = await prisma.jobPosting.findFirst({ where: { id, authorId: userId } });
      if (!jd) {
        res.status(404).json({ error: "未找到 JD" });
        return;
      }

      const check = checkQuota(userId, "search");
      if (!check.allowed) {
        res.status(429).json({
          error: "本月搜索额度已用完",
          code: "QUOTA_EXCEEDED",
          quota: { dimension: "search", used: check.used, limit: check.limit, tier: check.tier },
        });
        return;
      }
      consumeQuota(userId, "search");

      const tags = Array.isArray(jd.matchTags)
        ? jd.matchTags.filter((x): x is string => typeof x === "string")
        : [];
      const tagLine = tags.length ? `【匹配标签】\n${tags.join("、")}` : "";
      const combinedQuery = [
        `【职位标题】\n${jd.title}`,
        jd.companyName ? `【公司】\n${jd.companyName}` : "",
        jd.location ? `【地点】\n${jd.location}` : "",
        `【职位描述 JD】\n${jd.body.slice(0, 12_000)}`,
        tagLine,
      ]
        .filter(Boolean)
        .join("\n\n");

      const token = getServerGitHubToken();
      const ridRaw = req.get("x-request-id")?.trim();
      const pipelineRequestId =
        ridRaw && ridRaw.length >= 4 && ridRaw.length <= 128 && !/[\r\n]/.test(ridRaw)
          ? ridRaw.slice(0, 128)
          : randomUUID();
      const pack = await searchDevelopers(combinedQuery, new Map() as never, token, undefined, {
        requestId: pipelineRequestId,
      });
      const raw = pack.results;
      const limit = Math.min(20, Math.max(5, parseInt(String(req.body?.limit || "12"), 10) || 12));
      const results = raw.slice(0, limit).map((r) => ({
        githubUsername: r.githubUsername,
        avatarUrl: r.avatarUrl,
        oneLiner: r.oneLiner,
        techTags: r.techTags,
        score: r.score,
        reason: r.reason,
        stats: r.stats,
        location: r.location,
      }));

      res.json({ results, meta: { jdId: id, count: results.length } });
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
