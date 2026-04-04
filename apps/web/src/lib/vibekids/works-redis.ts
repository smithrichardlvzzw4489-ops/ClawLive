import { Redis } from "@upstash/redis";

const KEY = "clawlive:vibekids:works:v1";
const FAV_DEDUPE_KEY = "clawlive:vibekids:fav_dedupe:v1";

function restUrl(): string | undefined {
  return (
    process.env.VIBEKIDS_UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim()
  );
}

function restToken(): string | undefined {
  return (
    process.env.VIBEKIDS_UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function vibekidsWorksRedisEnabled(): boolean {
  return Boolean(restUrl() && restToken());
}

function getVibekidsWorksRedis(): Redis | null {
  const url = restUrl();
  const token = restToken();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function redisGetWorksJson(): Promise<string | null> {
  const r = getVibekidsWorksRedis();
  if (!r) return null;
  const v = await r.get<unknown>(KEY);
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export async function redisSetWorksJson(json: string): Promise<void> {
  const r = getVibekidsWorksRedis();
  if (!r) throw new Error("redis_not_configured");
  await r.set(KEY, json);
}

export async function redisGetFavoriteDedupeJson(): Promise<string | null> {
  const r = getVibekidsWorksRedis();
  if (!r) return null;
  const v = await r.get<unknown>(FAV_DEDUPE_KEY);
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export async function redisSetFavoriteDedupeJson(json: string): Promise<void> {
  const r = getVibekidsWorksRedis();
  if (!r) throw new Error("redis_not_configured");
  await r.set(FAV_DEDUPE_KEY, json);
}
