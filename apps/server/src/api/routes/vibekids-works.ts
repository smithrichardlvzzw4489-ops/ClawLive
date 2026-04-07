import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import type { IRouter } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { sanitizeVibekidsWorkHtml } from "../../lib/vibekids-html-sanitizer";
import { getUserIdFromBearer } from "../middleware/auth";

const router: IRouter = Router();

const MAX_HTML_BYTES = 900_000;
const MAX_LIST = 300;
const MAX_COMMENTS_PER_WORK = 80;
const MAX_COMMENT_BODY_LEN = 280;

type WorkComment = { id: string; body: string; createdAt: string };

function parseAgeBand(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (s === "middle" || s === "primary") return "unified";
  if (s === "unified") return "unified";
  return "unified";
}

function parseKind(v: unknown): string | undefined {
  const k = typeof v === "string" ? v : "any";
  const ok = ["any", "game", "tool", "story", "showcase"].includes(k);
  if (!ok || k === "any") return undefined;
  return k;
}

function stripHtmlForSummary(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function extractTitleFromHtml(html: string, fallback: string): string {
  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (t?.[1]?.trim()) return t[1].trim().slice(0, 120);
  const h = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (h?.[1]?.trim()) return h[1].trim().replace(/&nbsp;/g, " ").slice(0, 120);
  const plain = stripHtmlForSummary(html);
  if (plain.length >= 8) return plain.slice(0, 80);
  return fallback.slice(0, 80) || "未命名作品";
}

function normalizeComments(raw: unknown): WorkComment[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkComment[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const body =
      typeof o.body === "string" ? o.body.slice(0, MAX_COMMENT_BODY_LEN) : "";
    const createdAt =
      typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
    if (id && body.trim()) out.push({ id, body: body.trim(), createdAt });
  }
  return out.slice(-MAX_COMMENTS_PER_WORK);
}

function rowToSummary(row: {
  id: string;
  title: string;
  ageBand: string;
  createdAt: Date;
  prompt: string | null;
  kind: string | null;
  likes: number;
  shares: number;
  favorites: number;
  comments: Prisma.JsonValue;
  published: boolean;
}) {
  const comments = normalizeComments(row.comments);
  return {
    id: row.id,
    title: row.title,
    ageBand: row.ageBand,
    createdAt: row.createdAt.toISOString(),
    prompt: row.prompt ?? undefined,
    kind: row.kind ?? undefined,
    likes: row.likes,
    shares: row.shares,
    favorites: row.favorites,
    commentCount: comments.length,
    published: row.published,
  };
}

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** GET / 与 POST / */
router.get("/", async (req: Request, res: Response) => {
  try {
    const uid = getUserIdFromBearer(req);
    const scope =
      typeof req.query.scope === "string" ? req.query.scope.trim() : "";
    const mine = req.query.mine === "1" || req.query.mine === "true";

    if (scope === "published") {
      const rows = await prisma.vibekidsWork.findMany({
        where: { published: true },
        orderBy: { createdAt: "desc" },
        take: MAX_LIST,
        select: {
          id: true,
          title: true,
          ageBand: true,
          createdAt: true,
          prompt: true,
          kind: true,
          likes: true,
          shares: true,
          favorites: true,
          comments: true,
          published: true,
        },
      });
      return res.status(200).set(NO_STORE).json({
        works: rows.map((r) => rowToSummary(r)),
      });
    }

    if (mine) {
      if (!uid) {
        return res
          .status(401)
          .set(NO_STORE)
          .json({ error: "login_required", works: [] });
      }
      const rows = await prisma.vibekidsWork.findMany({
        where: { userId: uid },
        orderBy: { createdAt: "desc" },
        take: MAX_LIST,
        select: {
          id: true,
          title: true,
          ageBand: true,
          createdAt: true,
          prompt: true,
          kind: true,
          likes: true,
          shares: true,
          favorites: true,
          comments: true,
          published: true,
        },
      });
      return res.status(200).set(NO_STORE).json({
        works: rows.map((r) => rowToSummary(r)),
      });
    }

    return res.status(200).set(NO_STORE).json({ works: [] });
  } catch (e) {
    console.error("[vibekids-works] GET /", e);
    return res.status(500).set(NO_STORE).json({ error: "read_failed", works: [] });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const uid = getUserIdFromBearer(req);
  if (!uid) {
    return res.status(401).json({ error: "login_required" });
  }

  const b = req.body as {
    html?: unknown;
    ageBand?: unknown;
    prompt?: unknown;
    kind?: unknown;
    title?: unknown;
  };

  const rawHtml = typeof b.html === "string" ? b.html.trim() : "";
  if (!rawHtml) {
    return res.status(400).json({ error: "empty_html" });
  }

  const sanitized = sanitizeVibekidsWorkHtml(rawHtml);
  if (!sanitized.ok) {
    return res.status(400).json({
      error: sanitized.code,
      detail: sanitized.detail,
    });
  }
  const html = sanitized.html;
  if (sanitized.warnings.length > 0) {
    console.log("[vibekids-works] HTML sanitize warnings:", sanitized.warnings);
  }

  const size = Buffer.byteLength(html, "utf8");
  if (size > MAX_HTML_BYTES) {
    return res.status(413).json({ error: "html_too_large" });
  }

  const ageBand = parseAgeBand(b.ageBand);
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : undefined;
  const titleInput = typeof b.title === "string" ? b.title.trim() : "";
  const kind = parseKind(b.kind);
  const title =
    titleInput ||
    extractTitleFromHtml(html, prompt || "未命名作品");

  try {
    const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true } });
    if (!user) {
      return res.status(401).json({ error: "login_required" });
    }

    const row = await prisma.vibekidsWork.create({
      data: {
        userId: uid,
        title,
        html,
        ageBand,
        published: false,
        likes: 0,
        shares: 0,
        favorites: 0,
        comments: [],
        ...(prompt ? { prompt } : {}),
        ...(kind ? { kind } : {}),
      },
    });

    return res.status(200).json({
      ok: true,
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      published: row.published,
    });
  } catch (e) {
    console.error("[vibekids-works] POST /", e);
    return res.status(503).json({
      error: "storage_failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /publish-state — 必须在 /:id 之前 */
router.post("/publish-state", async (req: Request, res: Response) => {
  const uid = getUserIdFromBearer(req);
  if (!uid) {
    return res.status(401).json({ error: "login_required" });
  }

  const b = req.body as { id?: unknown; published?: unknown };
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) {
    return res.status(400).json({ error: "id_required" });
  }
  if (typeof b.published !== "boolean") {
    return res.status(400).json({ error: "published_boolean_required" });
  }

  try {
    const work = await prisma.vibekidsWork.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!work) {
      return res.status(404).json({ error: "not_found" });
    }
    if (work.userId !== uid) {
      return res.status(403).json({ error: "forbidden" });
    }

    await prisma.vibekidsWork.update({
      where: { id },
      data: { published: b.published },
    });

    return res.json({ ok: true, id, published: b.published });
  } catch (e) {
    console.error("[vibekids-works] publish-state", e);
    return res.status(503).json({
      error: "storage_failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

function parseClientId(q: string | undefined): string | null {
  if (typeof q !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(q)) return null;
  return q;
}

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id?.trim()) {
    return res.status(400).set(NO_STORE).json({ error: "invalid_id" });
  }
  if (id === "publish-state") {
    return res.status(400).set(NO_STORE).json({ error: "invalid_id" });
  }

  try {
    const work = await prisma.vibekidsWork.findUnique({ where: { id } });
    if (!work) {
      return res.status(404).set(NO_STORE).json({ error: "not_found" });
    }

    const viewerUid = getUserIdFromBearer(req);
    if (!work.published && work.userId !== viewerUid) {
      return res.status(403).set(NO_STORE).json({ error: "forbidden" });
    }

    const clientId = parseClientId(
      typeof req.query.clientId === "string" ? req.query.clientId : undefined,
    );
    let viewerFavorited = false;
    if (clientId) {
      const dedupe = await prisma.vibekidsWorkFavoriteDedupe.findUnique({
        where: {
          clientId_workId: { clientId, workId: id },
        },
      });
      viewerFavorited = !!dedupe;
    }

    const comments = normalizeComments(work.comments);

    return res.status(200).set(NO_STORE).json({
      work: {
        id: work.id,
        title: work.title,
        html: work.html,
        prompt: work.prompt ?? undefined,
        published: work.published,
        ageBand: work.ageBand,
        likes: work.likes,
        shares: work.shares,
        favorites: work.favorites,
        comments,
        viewerFavorited,
        createdAt: work.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[vibekids-works] GET :id", e);
    return res.status(500).set(NO_STORE).json({
      error: "read_failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id?.trim()) {
    return res.status(400).set(NO_STORE).json({ error: "invalid_id" });
  }

  const uid = getUserIdFromBearer(req);
  if (!uid) {
    return res.status(401).set(NO_STORE).json({ error: "login_required" });
  }

  const published = (req.body as { published?: unknown }).published;
  if (typeof published !== "boolean") {
    return res.status(400).set(NO_STORE).json({ error: "published_boolean_required" });
  }

  try {
    const work = await prisma.vibekidsWork.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!work) {
      return res.status(404).set(NO_STORE).json({ error: "not_found" });
    }
    if (work.userId !== uid) {
      return res.status(403).set(NO_STORE).json({ error: "forbidden" });
    }

    await prisma.vibekidsWork.update({
      where: { id },
      data: { published },
    });

    return res.status(200).set(NO_STORE).json({ ok: true, id, published });
  } catch (e) {
    console.error("[vibekids-works] PATCH :id", e);
    return res.status(503).set(NO_STORE).json({
      error: "storage_failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

router.post("/:id/like", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const updated = await prisma.vibekidsWork.updateMany({
      where: { id },
      data: { likes: { increment: 1 } },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    const row = await prisma.vibekidsWork.findUnique({
      where: { id },
      select: { likes: true },
    });
    return res.json({ ok: true, likes: row?.likes ?? 0 });
  } catch (e) {
    console.error("[vibekids-works] like", e);
    return res.status(500).json({ error: "failed" });
  }
});

router.post("/:id/share", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const updated = await prisma.vibekidsWork.updateMany({
      where: { id },
      data: { shares: { increment: 1 } },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    const row = await prisma.vibekidsWork.findUnique({
      where: { id },
      select: { shares: true },
    });
    return res.json({ ok: true, shares: row?.shares ?? 0 });
  } catch (e) {
    console.error("[vibekids-works] share", e);
    return res.status(500).json({ error: "failed" });
  }
});

router.post("/:id/favorite", async (req: Request, res: Response) => {
  const { id } = req.params;
  const b = req.body as { clientId?: unknown; favorited?: unknown };
  const clientId = typeof b.clientId === "string" ? b.clientId : "";
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientId)) {
    return res.status(400).json({ error: "client_id_invalid" });
  }
  if (typeof b.favorited !== "boolean") {
    return res.status(400).json({ error: "favorited_boolean_required" });
  }

  try {
    const work = await prisma.vibekidsWork.findUnique({
      where: { id },
      select: { favorites: true },
    });
    if (!work) {
      return res.status(404).json({ error: "not_found" });
    }

    if (b.favorited) {
      try {
        await prisma.$transaction([
          prisma.vibekidsWorkFavoriteDedupe.create({
            data: { clientId, workId: id },
          }),
          prisma.vibekidsWork.update({
            where: { id },
            data: { favorites: { increment: 1 } },
          }),
        ]);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return res.json({
            ok: true,
            favorites: work.favorites,
            favorited: true,
          });
        }
        throw err;
      }
    } else {
      const del = await prisma.vibekidsWorkFavoriteDedupe.deleteMany({
        where: { clientId, workId: id },
      });
      if (del.count > 0) {
        const next = Math.max(0, work.favorites - 1);
        await prisma.vibekidsWork.update({
          where: { id },
          data: { favorites: next },
        });
      }
    }

    const row = await prisma.vibekidsWork.findUnique({
      where: { id },
      select: { favorites: true },
    });
    return res.json({
      ok: true,
      favorites: row?.favorites ?? 0,
      favorited: b.favorited,
    });
  } catch (e) {
    console.error("[vibekids-works] favorite", e);
    return res.status(500).json({ error: "failed" });
  }
});

router.post("/:id/comments", async (req: Request, res: Response) => {
  const { id } = req.params;
  const text = (req.body as { body?: unknown }).body;
  if (typeof text !== "string") {
    return res.status(400).json({ error: "body_string_required" });
  }

  const trimmed = text.trim().slice(0, MAX_COMMENT_BODY_LEN);
  if (!trimmed) {
    return res.status(400).json({ error: "empty" });
  }

  try {
    const work = await prisma.vibekidsWork.findUnique({ where: { id } });
    if (!work) {
      return res.status(404).json({ error: "not_found" });
    }
    if (!work.published) {
      return res.status(403).json({ error: "unpublished" });
    }

    const prev = normalizeComments(work.comments);
    if (prev.length >= MAX_COMMENTS_PER_WORK) {
      return res.status(429).json({ error: "limit" });
    }

    const entry: WorkComment = {
      id: randomUUID(),
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    const comments = [...prev, entry];

    await prisma.vibekidsWork.update({
      where: { id },
      data: { comments: comments as unknown as Prisma.InputJsonValue },
    });

    return res.json({ ok: true, comments });
  } catch (e) {
    console.error("[vibekids-works] comments", e);
    return res.status(500).json({ error: "failed" });
  }
});

export function vibekidsWorksRoutes(): IRouter {
  return router;
}
