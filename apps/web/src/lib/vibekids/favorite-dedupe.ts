import { promises as fs } from "fs";
import path from "path";
import { getVibekidsDataDir } from "@/lib/vibekids/data-dir";
import {
  redisGetFavoriteDedupeJson,
  redisSetFavoriteDedupeJson,
  vibekidsWorksRedisEnabled,
} from "@/lib/vibekids/works-redis";

type Dedupe = Record<string, true>;

function filePath(): string {
  return path.join(getVibekidsDataDir(), "favorite-dedupe.json");
}

function parseDedupe(raw: string): Dedupe {
  try {
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    return p as Dedupe;
  } catch {
    return {};
  }
}

async function readDedupe(): Promise<Dedupe> {
  if (vibekidsWorksRedisEnabled()) {
    try {
      const raw = await redisGetFavoriteDedupeJson();
      if (!raw) return {};
      return parseDedupe(raw);
    } catch {
      return {};
    }
  }
  try {
    const raw = await fs.readFile(filePath(), "utf-8");
    return parseDedupe(raw);
  } catch {
    return {};
  }
}

async function writeDedupe(m: Dedupe): Promise<void> {
  const payload = JSON.stringify(m);
  if (vibekidsWorksRedisEnabled()) {
    await redisSetFavoriteDedupeJson(payload);
    return;
  }
  await fs.mkdir(getVibekidsDataDir(), { recursive: true });
  await fs.writeFile(filePath(), payload, "utf-8");
}

export function favoriteDedupeKey(clientId: string, workId: string): string {
  return `${clientId}::${workId}`;
}

export async function favoriteDedupeHas(key: string): Promise<boolean> {
  const m = await readDedupe();
  return Boolean(m[key]);
}

/** @returns true if newly added */
export async function favoriteDedupeTryAdd(key: string): Promise<boolean> {
  const m = await readDedupe();
  if (m[key]) return false;
  m[key] = true;
  await writeDedupe(m);
  return true;
}

/** @returns true if existed and removed */
export async function favoriteDedupeTryRemove(key: string): Promise<boolean> {
  const m = await readDedupe();
  if (!m[key]) return false;
  delete m[key];
  await writeDedupe(m);
  return true;
}
