'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';

/** 首页主栏顶部搜索（替代顶栏内搜索，贴近信息流布局） */
export function HomeSearchBar() {
  const { t } = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const s = q.trim();
    if (s) router.push(`/search?q=${encodeURIComponent(s)}`);
  };

  return (
    <form onSubmit={onSubmit} className="mb-4">
      <div className="relative max-w-2xl mx-auto">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-11 pr-4 py-3 rounded-full bg-gray-100 border-0 text-gray-800 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-lobster/25 focus:bg-white transition-all"
        />
      </div>
    </form>
  );
}
