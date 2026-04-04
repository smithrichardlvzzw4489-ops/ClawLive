import type { SavedWorkSummary } from "@/lib/works-storage";

export type WorkSortMode = "new" | "likes" | "hot" | "spotlight";

/** 精选排序：综合质量分、赞、精选候选与时间新鲜度（供 client sort 与 server 列表共用） */
export function spotlightRank(w: SavedWorkSummary): number {
  const q = w.qualityScore ?? 0;
  const l = w.likes ?? 0;
  const boost = w.spotlightRequested ? 25 : 0;
  const ageMs = Date.now() - new Date(w.createdAt).getTime();
  const days = ageMs / 86_400_000;
  const freshness = Math.max(0, 18 - days * 0.8);
  return q * 1.2 + 4 * Math.log1p(l) + boost + freshness;
}

/** 热度：赞数 + 新内容加权（时间衰减） */
export function hotScore(w: SavedWorkSummary): number {
  const likes = w.likes ?? 0;
  const days =
    (Date.now() - new Date(w.createdAt).getTime()) / 86_400_000;
  return likes * 3 + 28 / (1 + days * 0.35);
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
