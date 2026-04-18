import { Router, Response, Request } from "express";
import { authenticateToken, AuthRequest, getUserIdFromBearer } from "../middleware/auth";
import { prisma } from "../../lib/prisma";
import { notifyMatchedUsersForJobPosting } from "../../services/job-plaza-notify";
import { computeTagMatchPreview, userTechTagsFromAnalysis } from "../../services/job-plaza-tag-match";
import { resolveGithubPortraitForMath } from "../../services/github-portrait-resolve-math";
import { checkQuota, consumeQuota } from "../../services/quota-manager";
import { runJdResumeMatchAnalysis } from "../../services/jd-resume-match";

const MAX_MATH_COMBINED = 90_000;

const MAX_TITLE = 200;
const MAX_BODY = 50_000;
const MAX_TAG = 40;
const MAX_TAGS = 24;

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

function buildJdTextForMathMatch(row: {
  title: string;
  companyName: string | null;
  location: string | null;
  body: string;
  matchTags: unknown;
}): string {
  const tags = Array.isArray(row.matchTags)
    ? row.matchTags.filter((x): x is string => typeof x === "string").map((t) => t.trim()).filter(Boolean)
    : [];
  const parts = [
    `【职位】${row.title.trim()}`,
    row.companyName?.trim() ? `【公司】${row.companyName.trim()}` : null,
    row.location?.trim() ? `【地点】${row.location.trim()}` : null,
    tags.length ? `【匹配标签】${tags.join("、")}` : null,
    `【职位描述】\n${row.body.trim()}`,
  ].filter(Boolean) as string[];
  return parts.join("\n\n");
}

function serializePosting(
  row: {
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
    author?: { username: string; githubUsername: string | null };
  },
  opts?: { includeBody?: boolean },
) {
  const tags = Array.isArray(row.matchTags)
    ? row.matchTags.filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    companyName: row.companyName,
    location: row.location,
    body: opts?.includeBody === false ? undefined : row.body,
    matchTags: tags,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: row.author,
  };
}

export function jobPlazaRoutes(): Router {
  const router = Router();

  /** 登录求职者：批量返回与站内通知一致的「标签×JD 正文」预估，用于列表卡片 */
  router.post("/match-previews", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const raw = (req.body as { ids?: unknown })?.ids;
      const ids = Array.isArray(raw)
        ? raw
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 25)
        : [];
      if (ids.length === 0) {
        res.status(400).json({ error: "请提供 ids 数组" });
        return;
      }
      const uniqueIds = [...new Set(ids)];

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { codernetAnalysis: true, personalResume: true, githubUsername: true },
      });
      const userTags = userTechTagsFromAnalysis(user?.codernetAnalysis);
      const hasMaterials = Boolean(
        (user?.personalResume || "").trim() || (user?.githubUsername || "").trim().replace(/^@/, ""),
      );

      const postings = await prisma.jobPosting.findMany({
        where: { id: { in: uniqueIds }, status: "published", publishedAt: { not: null } },
        select: { id: true, title: true, body: true, matchTags: true },
      });

      const previews: Record<
        string,
        {
          tagMatchPercent: number;
          rawTagScore: number;
          maxTagScore: number;
          tagLines: Array<{ jobTag: string; bodyHit: boolean; userMatch?: string; points: number }>;
          hasMaterials: boolean;
          userTagCount: number;
        }
      > = {};

      for (const p of postings) {
        const jobTags = parseMatchTags(p.matchTags);
        const titleBody = `${p.title}\n${p.body}`;
        const { rawScore, maxScore, percent, lines } = computeTagMatchPreview(jobTags, userTags, titleBody);
        previews[p.id] = {
          tagMatchPercent: percent,
          rawTagScore: rawScore,
          maxTagScore: maxScore,
          tagLines: lines,
          hasMaterials,
          userTagCount: userTags.length,
        };
      }

      res.json({ previews });
    } catch (e) {
      console.error("[job-plaza] match-previews", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  /** 登录用户：对单条已发布 JD 调用与 `/api/math/match` 相同的 LLM 分析（扣 jd_resume_match 额度） */
  router.post("/:id/math-match", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;

      const q = checkQuota(userId, "jd_resume_match");
      if (!q.allowed) {
        res.status(429).json({
          error: "本月 Math 匹配次数已用完",
          code: "QUOTA_EXCEEDED",
          quota: { dimension: "jd_resume_match", used: q.used, limit: q.limit, tier: q.tier },
        });
        return;
      }

      const posting = await prisma.jobPosting.findUnique({ where: { id } });
      if (!posting || posting.status !== "published" || !posting.publishedAt) {
        res.status(404).json({ error: "未找到" });
        return;
      }

      const jdCombined = buildJdTextForMathMatch(posting);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { personalResume: true, githubUsername: true },
      });
      const resumeCombined = (user?.personalResume || "").trim();
      const githubUsername = (user?.githubUsername || "").trim().replace(/^@/, "");

      if (!jdCombined) {
        res.status(400).json({ error: "职位正文为空" });
        return;
      }

      let githubPortraitSummary = "";
      if (githubUsername) {
        const gh = await resolveGithubPortraitForMath(githubUsername);
        if (!gh.ok) {
          const status = gh.code === "INVALID" ? 400 : 502;
          res.status(status).json({
            error: gh.message,
            code: gh.code ?? "GITHUB_FETCH_FAILED",
            githubLogin: githubUsername,
          });
          return;
        }
        githubPortraitSummary = gh.portraitSummary;
      }

      if (!resumeCombined && !githubPortraitSummary) {
        res.status(400).json({
          error: "请在个人资料中填写「个人简历」或绑定 GitHub，以便使用与首页 MATH 相同的材料参与匹配。",
          code: "NO_CANDIDATE_MATERIAL",
        });
        return;
      }

      if (jdCombined.length + resumeCombined.length > MAX_MATH_COMBINED) {
        res.status(400).json({ error: "JD 与简历合并长度过长，请删减个人资料中的简历正文或分次匹配" });
        return;
      }

      const result = await runJdResumeMatchAnalysis({
        jdText: jdCombined,
        resumeText: resumeCombined,
        githubPortraitSummary,
      });

      consumeQuota(userId, "jd_resume_match", 1);

      res.json({
        result,
        meta: {
          jobPostingId: id,
          jdChars: jdCombined.length,
          resumeChars: resumeCombined.length,
          githubUsed: Boolean(githubUsername),
        },
      });
    } catch (e) {
      console.error("[job-plaza] math-match", e);
      const msg = e instanceof Error ? e.message : "匹配失败";
      res.status(500).json({ error: msg });
    }
  });

  /** 公开：未登录可浏览已发布职位 */
  router.get("/", async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
      const skip = (page - 1) * limit;

      const [rows, total] = await Promise.all([
        prisma.jobPosting.findMany({
          where: { status: "published", publishedAt: { not: null } },
          orderBy: { publishedAt: "desc" },
          skip,
          take: limit,
          include: {
            author: { select: { username: true, githubUsername: true } },
          },
        }),
        prisma.jobPosting.count({ where: { status: "published", publishedAt: { not: null } } }),
      ]);

      res.json({
        items: rows.map((r) => serializePosting(r, { includeBody: false })),
        page,
        limit,
        total,
      });
    } catch (e) {
      console.error("[job-plaza] list", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  router.get("/mine", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const rows = await prisma.jobPosting.findMany({
        where: { authorId: userId },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { author: { select: { username: true, githubUsername: true } } },
      });
      res.json({ items: rows.map((r) => serializePosting(r)) });
    } catch (e) {
      console.error("[job-plaza] mine", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  /** 公开：已发布任何人可看；未发布仅作者（带有效 JWT）可看 */
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const row = await prisma.jobPosting.findUnique({
        where: { id: req.params.id },
        include: {
          author: { select: { username: true, githubUsername: true } },
        },
      });
      if (!row) {
        res.status(404).json({ error: "未找到" });
        return;
      }
      const viewerId = getUserIdFromBearer(req);
      if (row.status !== "published") {
        if (!viewerId || viewerId !== row.authorId) {
          res.status(404).json({ error: "未找到" });
          return;
        }
      }
      res.json({ posting: serializePosting(row) });
    } catch (e) {
      console.error("[job-plaza] get", e);
      res.status(500).json({ error: "加载失败" });
    }
  });

  router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const companyName =
        typeof req.body?.companyName === "string" ? req.body.companyName.trim() || null : null;
      const location = typeof req.body?.location === "string" ? req.body.location.trim() || null : null;
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      const matchTags = parseMatchTags(req.body?.matchTags);
      const publishNow = req.body?.publish === true;

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
      if (matchTags.length === 0) {
        res.status(400).json({ error: "请填写至少一个匹配标签（用于向合适候选人发站内通知）" });
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
          status: publishNow ? "published" : "draft",
          publishedAt: publishNow ? new Date() : null,
        },
        include: { author: { select: { username: true, githubUsername: true } } },
      });

      let notified = 0;
      if (publishNow) {
        const r = await notifyMatchedUsersForJobPosting(prisma, row.id, userId, {
          title: row.title,
          companyName: row.companyName,
          location: row.location,
          body: row.body,
          matchTags,
        });
        notified = r.sent;
      }

      res.status(201).json({
        posting: serializePosting(row),
        notified,
      });
    } catch (e) {
      console.error("[job-plaza] create", e);
      res.status(500).json({ error: "创建失败" });
    }
  });

  router.patch("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const existing = await prisma.jobPosting.findUnique({ where: { id } });
      if (!existing || existing.authorId !== userId) {
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
          res.status(400).json({ error: "至少保留一个匹配标签" });
          return;
        }
        patch.matchTags = tags;
      }

      const row = await prisma.jobPosting.update({
        where: { id },
        data: patch,
        include: { author: { select: { username: true, githubUsername: true } } },
      });
      res.json({ posting: serializePosting(row) });
    } catch (e) {
      console.error("[job-plaza] patch", e);
      res.status(500).json({ error: "更新失败" });
    }
  });

  router.post("/:id/publish", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const row = await prisma.jobPosting.findUnique({ where: { id } });
      if (!row || row.authorId !== userId) {
        res.status(404).json({ error: "未找到" });
        return;
      }
      if (row.status === "closed") {
        res.status(400).json({ error: "已关闭" });
        return;
      }
      if (row.status === "published") {
        const withAuthor = await prisma.jobPosting.findUnique({
          where: { id },
          include: { author: { select: { username: true, githubUsername: true } } },
        });
        res.json({
          posting: withAuthor ? serializePosting(withAuthor) : serializePosting(row),
          notified: 0,
          alreadyPublished: true,
        });
        return;
      }

      const matchTags = Array.isArray(row.matchTags)
        ? row.matchTags.filter((x): x is string => typeof x === "string")
        : [];
      if (matchTags.length === 0) {
        res.status(400).json({ error: "请先补充匹配标签后再发布" });
        return;
      }

      const updated = await prisma.jobPosting.update({
        where: { id },
        data: { status: "published", publishedAt: new Date() },
        include: { author: { select: { username: true, githubUsername: true } } },
      });

      const r = await notifyMatchedUsersForJobPosting(prisma, id, userId, {
        title: updated.title,
        companyName: updated.companyName,
        location: updated.location,
        body: updated.body,
        matchTags,
      });

      res.json({ posting: serializePosting(updated), notified: r.sent });
    } catch (e) {
      console.error("[job-plaza] publish", e);
      res.status(500).json({ error: "发布失败" });
    }
  });

  router.post("/:id/close", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const row = await prisma.jobPosting.findUnique({ where: { id } });
      if (!row || row.authorId !== userId) {
        res.status(404).json({ error: "未找到" });
        return;
      }
      const updated = await prisma.jobPosting.update({
        where: { id },
        data: { status: "closed" },
        include: { author: { select: { username: true, githubUsername: true } } },
      });
      res.json({ posting: serializePosting(updated) });
    } catch (e) {
      console.error("[job-plaza] close", e);
      res.status(500).json({ error: "操作失败" });
    }
  });

  return router;
}
