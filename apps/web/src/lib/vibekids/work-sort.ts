import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";

export type WorkSortMode = "new" | "likes" | "hot" | "spotlight";

function daysSinceCreated(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/** 新发布温和加成（指数衰减），减轻「只有老作品占榜」的马太效应 */
function newWorkBoost(days: number, scale: number): number {
  if (days >= 8 || days < 0) return 0;
  return scale * Math.exp(-days / 2.8);
}

/** 精选排序：综合质量分、赞、精选候选与时间新鲜度（供 client sort 与 server 列表共用） */
export function spotlightRank(w: SavedWorkSummary): number {
  const q = w.qualityScore ?? 0;
  const l = w.likes ?? 0;
  const boost = w.spotlightRequested ? 25 : 0;
  const days = daysSinceCreated(w.createdAt);
  const freshness = Math.max(0, 18 - days * 0.8);
  return (
    q * 1.2 +
    4 * Math.log1p(l) +
    boost +
    freshness +
    newWorkBoost(days, 5)
  );
}

/** 热度：赞数 + 新内容加权（时间衰减） */
export function hotScore(w: SavedWorkSummary): number {
  const likes = w.likes ?? 0;
  const days = daysSinceCreated(w.createdAt);
  const base = likes * 3 + 28 / (1 + days * 0.35);
  return base + newWorkBoost(days, 11);
}

export function sortWorks(
  works: SavedWorkSummary[],
  mode: WorkSortMode,
): SavedWorkSummary[] {
  const copy = [...works];
  if (mode === "new") {
    return copy.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  if (mode === "likes") {
    return copy.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  }
  if (mode === "spotlight") {
    return copy.sort((a, b) => spotlightRank(b) - spotlightRank(a));
  }
  return copy.sort((a, b) => hotScore(b) - hotScore(a));
}
