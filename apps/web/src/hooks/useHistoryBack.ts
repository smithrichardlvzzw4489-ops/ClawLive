'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * 返回上一页：优先 `history.back()`；无可用历史（如新标签直接打开）时跳转 `fallbackHref`。
 */
export function useHistoryBack(fallbackHref: string) {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window === 'undefined') {
      router.push(fallbackHref);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [router, fallbackHref]);
}
