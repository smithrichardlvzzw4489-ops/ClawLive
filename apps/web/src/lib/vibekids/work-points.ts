/** 已发布作品在广场上的积分：发布计 5 分，每个赞计 1 分 */

export const PUBLISH_POINTS = 5;
export const LIKE_POINTS = 1;

export function workListingScore(w: {
  published: boolean;
  likes?: number;
}): number {
  const likes = w.likes ?? 0;
  if (!w.published) return likes;
  return PUBLISH_POINTS + likes * LIKE_POINTS;
}
