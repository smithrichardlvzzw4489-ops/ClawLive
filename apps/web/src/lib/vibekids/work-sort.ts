import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";
import { workListingScore } from "@/lib/vibekids/work-points";

export type WorkSortMode = "new" | "likes" | "score" | "hot";

function daysSinceCreated(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/** 新发布温和加成（指数衰减） */
function newWorkBoost(days: number, scale: number): number {
  if (days >= 8 || days < 0) return 0;
  return scale * Math.exp(-days / 2.8);
}

/** 首页横滑与「作品分」排序：5 + 赞，并带一点新鲜度 */
export function spotlightRank(w: SavedWorkSummary): number {
  const base = workListingScore(w);
  const days = daysSinceCreated(w.createdAt);
  return base + newWorkBoost(days, 4);
}

/** 热门：作品分 + 更强的新内容加权 */
export function hotScore(w: SavedWorkSummary): number {
  const base = workListingScore(w);
  const days = daysSinceCreated(w.createdAt);
  return base + newWorkBoost(days, 6);
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
  if (mode === "score") {
    return copy.sort(
      (a, b) => workListingScore(b) - workListingScore(a),
    );
  }
  return copy.sort((a, b) => hotScore(b) - hotScore(a));
}
