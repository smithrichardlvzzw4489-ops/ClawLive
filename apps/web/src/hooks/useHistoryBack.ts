'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * 校验 `returnTo` 查询参数：仅允许本站相对路径，防止开放重定向。
 */
export function normalizeReturnToPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s.includes('://') || s.includes('\0')) return null;
  return s;
}

/**
 * 为站内跳转附加 `returnTo`，供目标页「返回上一级」精确回到当前页（pathname + search）。
 */
export function withReturnTo(destinationHref: string, currentPathWithSearch: string): string {
  const cur = currentPathWithSearch.startsWith('/') ? currentPathWithSearch : `/${currentPathWithSearch}`;
  const base = destinationHref.split('#')[0];
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}returnTo=${encodeURIComponent(cur)}`;
}

type UseHistoryBackOptions = {
  /** 优先使用 URL 中的 `?returnTo=`（站内相对路径） */
  returnTo?: string | null;
};

/**
 * 返回上一页：
 * 1. 若存在合法 `returnTo`（通常由站内链接附带），则 `push` 到该地址；
 * 2. 否则若浏览器历史栈仅有当前页，则 `push` 到 fallback；
 * 3. 否则 `history.back()`（回到上一浏览页，含从关系图谱点进来的情况）。
 */
export function useHistoryBack(fallbackHref: string, options?: UseHistoryBackOptions) {
  const router = useRouter();
  const resolved = normalizeReturnToPath(options?.returnTo ?? null);

  return useCallback(() => {
    if (resolved) {
      router.push(resolved);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length <= 1) {
      router.push(fallbackHref);
      return;
    }
    router.back();
  }, [router, fallbackHref, resolved]);
}
