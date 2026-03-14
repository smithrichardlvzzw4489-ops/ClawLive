/**
 * 用户行为上报，用于个性化推荐
 */

type BehaviorType = 'work_view' | 'room_join' | 'history_view' | 'work_like';

export function trackBehavior(type: BehaviorType, targetId: string): void {
  if (typeof window === 'undefined') return;

  const token = localStorage.getItem('token');
  if (!token) return;

  fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/behavior/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, targetId }),
  }).catch(() => {}); // 静默失败，不影响主流程
}
