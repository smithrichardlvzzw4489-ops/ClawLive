import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { AgeBand } from "@/lib/vibekids/age";
import { getVibekidsDataDir } from "@/lib/vibekids/data-dir";
import type { CreativeKind } from "@/lib/vibekids/creative";
import {
  favoriteDedupeKey,
  favoriteDedupeTryAdd,
  favoriteDedupeTryRemove,
} from "@/lib/vibekids/favorite-dedupe";
import {
  redisGetWorksJson,
  redisSetWorksJson,
  vibekidsWorksRedisEnabled,
} from "@/lib/vibekids/works-redis";
import { spotlightRank } from "@/lib/vibekids/work-sort";

export type WorkComment = {
  id: string;
  body: string;
  createdAt: string;
};

export type SavedWorkSummary = {
  id: string;
  title: string;
  ageBand: AgeBand;
  createdAt: string;
  prompt?: string;
  kind?: CreativeKind;
  likes?: number;
  shares?: number;
  favorites?: number;
  /** 评论条数（列表用） */
  commentCount?: number;
  published: boolean;
};

export type SavedWork = SavedWorkSummary & {
  html: string;
  comments?: WorkComment[];
};

const MAX_HTML_BYTES = 900_000;
const MAX_WORKS = 300;
const MAX_COMMENTS_PER_WORK = 80;
const MAX_COMMENT_BODY_LEN = 280;

export async function incrementWorkLike(id: string): Promise<number | null> {
  const works = await readRaw();
  const i = works.findIndex((w) => w.id === id);
  if (i < 0) return null;
  const next = (works[i]!.likes ?? 0) + 1;
  works[i] = { ...works[i]!, likes: next };
  await writeRaw(works);
  return next;
}

export async function incrementWorkShare(id: string): Promise<number | null> {
  const works = await readRaw();
  const i = works.findIndex((w) => w.id === id);
  if (i < 0) return null;
  const next = (works[i]!.shares ?? 0) + 1;
  works[i] = { ...works[i]!, shares: next };
  await writeRaw(works);
  return next;
}

export async function toggleWorkFavorite(
  id: string,
  clientId: string,
  favorited: boolean,
): Promise<{ favorites: number } | null> {
  const works = await readRaw();
  const i = works.findIndex((w) => w.id === id);
  if (i < 0) return null;
  const key = favoriteDedupeKey(clientId, id);
  let delta = 0;
  if (favorited) {
    const added = await favoriteDedupeTryAdd(key);
    if (added) delta = 1;
  } else {
    const removed = await favoriteDedupeTryRemove(key);
    if (removed) delta = -1;
  }
  const cur = works[i]!;
  const base = cur.favorites ?? 0;
  const nextFav = Math.max(0, base + delta);
  if (delta !== 0) {
    works[i] = { ...cur, favorites: nextFav };
    await writeRaw(works);
  }
  return { favorites: delta === 0 ? base : nextFav };
}

export async function addWorkComment(
  id: string,
  body: string,
): Promise<
  | { ok: true; comments: WorkComment[] }
  | { ok: false; reason: "not_found" | "empty" | "limit" | "unpublished" }
> {
  const trimmed = body.trim().slice(0, MAX_COMMENT_BODY_LEN);
  if (!trimmed) return { ok: false, reason: "empty" };
  const works = await readRaw();
  const i = works.findIndex((w) => w.id === id);
  if (i < 0) return { ok: false, reason: "not_found" };
  const cur = works[i]!;
  if (!cur.published) return { ok: false, reason: "unpublished" };
  const prev = Array.isArray(cur.comments) ? cur.comments : [];
  if (prev.length >= MAX_COMMENTS_PER_WORK) {
    return { ok: false, reason: "limit" };
  }
  const entry: WorkComment = {
    id: randomUUID(),
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  const comments = [...prev, entry];
  works[i] = { ...cur, comments };
  await writeRaw(works);
  return { ok: true, comments };
}

function worksFile(): string {
  return path.join(getVibekidsDataDir(), "works.json");
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

export function extractTitleFromHtml(html: string, fallback: string): string {
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
      typeof o.body === "string" ?
        o.body.slice(0, MAX_COMMENT_BODY_LEN)
      : "";
    const createdAt =
      typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
    if (id && body.trim()) out.push({ id, body: body.trim(), createdAt });
  }
  return out.slice(-MAX_COMMENTS_PER_WORK);
}

function normalizeWorksArray(parsed: unknown): SavedWork[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (x): x is SavedWork =>
        typeof x === "object" &&
        x !== null &&
        "id" in x &&
        "html" in x &&
        typeof (x as SavedWork).id === "string",
    )
    .map((w) => {
      const o = w as SavedWork;
      const comments = normalizeComments(o.comments);
      return {
        id: o.id,
        title: typeof o.title === "string" ? o.title : "未命名作品",
        html: o.html,
        ageBand: o.ageBand,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
        prompt: o.prompt,
        kind: o.kind,
        likes: typeof o.likes === "number" && o.likes >= 0 ? o.likes : 0,
        shares: typeof o.shares === "number" && o.shares >= 0 ? o.shares : 0,
        favorites:
          typeof o.favorites === "number" && o.favorites >= 0 ? o.favorites : 0,
        comments,
        published: typeof o.published === "boolean" ? o.published : true,
      };
    });
}

async function readRaw(): Promise<SavedWork[]> {
  if (vibekidsWorksRedisEnabled()) {
    try {
      const raw = await redisGetWorksJson();
      if (raw == null) return [];
      const parsed = JSON.parse(raw) as unknown;
      return normalizeWorksArray(parsed);
    } catch {
      return [];
    }
  }

  try {
    const raw = await fs.readFile(worksFile(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeWorksArray(parsed);
  } catch {
    return [];
  }
}

async function writeRaw(works: SavedWork[]): Promise<void> {
  const payload = JSON.stringify(works, null, 2);
  if (vibekidsWorksRedisEnabled()) {
    await redisSetWorksJson(payload);
    return;
  }
  await fs.mkdir(getVibekidsDataDir(), { recursive: true });
  await fs.writeFile(worksFile(), payload, "utf-8");
}

export async function getWorks(): Promise<SavedWork[]> {
  return readRaw();
}

export async function getWorkSummaries(): Promise<SavedWorkSummary[]> {
  const works = await readRaw();
  return works.map((w) => {
    const comments = w.comments;
    const commentCount = comments?.length ?? 0;
    return {
      id: w.id,
      title: w.title,
      ageBand: w.ageBand,
      createdAt: w.createdAt,
      prompt: w.prompt,
      kind: w.kind,
      likes: w.likes ?? 0,
      shares: w.shares ?? 0,
      favorites: w.favorites ?? 0,
      commentCount,
      published: w.published,
    };
  });
}

/** 仅已发布，供作品广场「发现」与首页精选流使用 */
export async function getPublishedWorkSummaries(): Promise<SavedWorkSummary[]> {
  const list = await getWorkSummaries();
  return list.filter((w) => w.published);
}

export async function getSpotlightSummaries(
  limit: number,
): Promise<SavedWorkSummary[]> {
  const list = await getPublishedWorkSummaries();
  if (list.length === 0) return [];
  return [...list]
    .sort((a, b) => spotlightRank(b) - spotlightRank(a))
    .slice(0, Math.max(1, limit));
}

export async function getWorkById(id: string): Promise<SavedWork | null> {
  const works = await readRaw();
  return works.find((w) => w.id === id) ?? null;
}

export async function setWorkPublished(
  id: string,
  published: boolean,
): Promise<boolean> {
  const works = await readRaw();
  const i = works.findIndex((w) => w.id === id);
  if (i < 0) return false;
  works[i] = { ...works[i]!, published };
  await writeRaw(works);
  return true;
}

export type SaveWorkInput = {
  html: string;
  ageBand: AgeBand;
  prompt?: string;
  kind?: CreativeKind;
  title?: string;
};

export async function saveWork(input: SaveWorkInput): Promise<SavedWork> {
  const size = Buffer.byteLength(input.html, "utf8");
  if (size > MAX_HTML_BYTES) {
    throw new Error("html_too_large");
  }

  let works = await readRaw();
  const title =
    input.title?.trim() ||
    extractTitleFromHtml(
      input.html,
      input.prompt?.trim() || "未命名作品",
    );

  const entry: SavedWork = {
    id: randomUUID(),
    title,
    html: input.html,
    ageBand: input.ageBand,
    createdAt: new Date().toISOString(),
    likes: 0,
    shares: 0,
    favorites: 0,
    comments: [],
    published: false,
    ...(input.prompt?.trim() ? { prompt: input.prompt.trim() } : {}),
    ...(input.kind && input.kind !== "any" ? { kind: input.kind } : {}),
  };

  works = [entry, ...works].slice(0, MAX_WORKS);
  await writeRaw(works);
  return entry;
}
