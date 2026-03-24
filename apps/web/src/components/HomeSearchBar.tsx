'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';

/** 首页主栏搜索（顶栏下方 sticky 区域使用） */
export function HomeSearchBar({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const s = q.trim();
    if (s) router.push(`/search?q=${encodeURIComponent(s)}`);
  };

  return (
    <form onSubmit={onSubmit} className={`w-full ${className}`}>
      <div className="relative w-full">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white/90 border border-gray-200/80 text-gray-800 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:bg-white focus:border-transparent transition-all shadow-sm"
        />
      </div>
    </form>
  );
}
