/**
 * VibeKids 单次生成/修改的墙钟预算（与 Darwin lobster 路径默认一致）。
 * 服务端可读 VIBEKIDS_GENERATE_DEADLINE_MS（毫秒，10s～600s 即 10000～600000）。
 * 浏览器侧用 NEXT_PUBLIC_VIBEKIDS_CLIENT_FETCH_MS 覆盖，否则为默认截止 + 缓冲。
 */
export const VIBEKIDS_GENERATE_DEADLINE_MS_DEFAULT = 300_000;

const MIN_DEADLINE_MS = 10_000;
const MAX_DEADLINE_MS = 600_000;

export function serverVibekidsDeadlineMs(): number {
  const n = Number(process.env.VIBEKIDS_GENERATE_DEADLINE_MS);
  if (Number.isFinite(n) && n >= MIN_DEADLINE_MS) {
    return Math.min(Math.floor(n), MAX_DEADLINE_MS);
  }
  return VIBEKIDS_GENERATE_DEADLINE_MS_DEFAULT;
}

const MIN_CLIENT_FETCH_MS = 20_000;
const MAX_CLIENT_FETCH_MS = 620_000;

export function clientVibekidsFetchMs(): number {
  const pub = Number(process.env.NEXT_PUBLIC_VIBEKIDS_CLIENT_FETCH_MS);
  if (Number.isFinite(pub) && pub >= MIN_CLIENT_FETCH_MS) {
    return Math.min(Math.floor(pub), MAX_CLIENT_FETCH_MS);
  }
  return VIBEKIDS_GENERATE_DEADLINE_MS_DEFAULT + 15_000;
}
