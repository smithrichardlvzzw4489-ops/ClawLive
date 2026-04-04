import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { AgeBand } from "@/lib/vibekids/age";
import { getVibekidsDataDir } from "@/lib/vibekids/data-dir";
import type { CreativeKind } from "@/lib/vibekids/creative";
import { spotlightRank } from "@/lib/vibekids/work-sort";
import { computeQualityScore } from "@/lib/vibekids/work-quality";

export type SavedWorkSummary = {
  id: string;
  title: string;
  ageBand: AgeBand;
  createdAt: string;
  prompt?: string;
  kind?: CreativeKind;
  /** 点赞数（旧数据无此字段时视为 0） */
  likes?: number;
  /** 保存时计算的优质分 0～100 */
  qualityScore?: number;
  /** 用户消耗积分申请的「精选候选」，用于展示加权 */
  spotlightRequested?: boolean;
  /**
   * 是否已在作品广场「发现」公开展示。
   * 旧数据无此字段时视为 true（与历史行为一致）；新保存默认为 false。
   */
  published: boolean;
};

export type SavedWork = SavedWorkSummary & {
  html: string;
};

export async function incrementWorkLike(id: string): Promise<number | null> {
  const works = await readRaw();
  const i = works.findIndex((w) => w.id === id);
  if (i < 0) return null;
  const next = (works[i]!.likes ?? 0) + 1;
  works[i] = { ...works[i]!, likes: next };
  await writeRaw(works);
  return next;
}

function worksFile(): string {
  return path.join(getVibekidsDataDir(), "works.json");
}

const MAX_HTML_BYTES = 900_000;
const MAX_WORKS = 300;

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

async function readRaw(): Promise<SavedWork[]> {
  try {
    const raw = await fs.readFile(worksFile(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
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
      .map((w) => ({
        ...w,
        likes: typeof w.likes === "number" && w.likes >= 0 ? w.likes : 0,
        qualityScore:
          typeof w.qualityScore === "number" && w.qualityScore >= 0 ?
            Math.min(100, w.qualityScore)
          : undefined,
        spotlightRequested: Boolean(w.spotlightRequested),
        published:
          typeof (w as SavedWork).published === "boolean" ?
            (w as SavedWork).published
          : true,
      }));
  } catch {
    return [];
  }
}

async function writeRaw(works: SavedWork[]): Promise<void> {
  await fs.mkdir(getVibekidsDataDir(), { recursive: true });
  await fs.writeFile(worksFile(), JSON.stringify(works, null, 2), "utf-8");
}

export async function getWorks(): Promise<SavedWork[]> {
  return readRaw();
}

export async function getWorkSummaries(): Promise<SavedWorkSummary[]> {
  const works = await readRaw();
  return works.map(({ html: _, ...rest }) => ({
    ...rest,
    likes: rest.likes ?? 0,
    qualityScore: rest.qualityScore,
    spotlightRequested: rest.spotlightRequested,
    published: rest.published,
  }));
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
  /** 使用本地「精选曝光券」时由客户端传入 */
  spotlightRequested?: boolean;
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

  const qs = computeQualityScore(input.html, input.prompt);
  const entry: SavedWork = {
    id: randomUUID(),
    title,
    html: input.html,
    ageBand: input.ageBand,
    createdAt: new Date().toISOString(),
    likes: 0,
    qualityScore: qs,
    published: false,
    ...(input.spotlightRequested ? { spotlightRequested: true } : {}),
    ...(input.prompt?.trim() ? { prompt: input.prompt.trim() } : {}),
    ...(input.kind && input.kind !== "any" ? { kind: input.kind } : {}),
  };

  works = [entry, ...works].slice(0, MAX_WORKS);
  await writeRaw(works);
  return entry;
}
