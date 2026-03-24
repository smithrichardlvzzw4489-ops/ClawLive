'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';
import { BRAND_ZH } from '@/lib/brand';

export function Header() {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (pathname === '/search') {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const q = params.get('q');
      if (q) setSearchTerm(q);
    }
  }, [pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchTerm)}`);
    }
  };

  const isActive = (path: string) => pathname.startsWith(path);
  const isHome = pathname === '/';

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b z-50 shadow-sm">
      <div className="h-16 px-4 sm:px-6 flex items-center gap-4 lg:gap-8">
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-3xl">🦞</span>
          <span className="text-2xl font-bold text-lobster tracking-tight">{BRAND_ZH}</span>
        </Link>

        <nav className={`flex items-center gap-1 ${isHome ? 'lg:hidden' : ''}`}>
          <Link
            href="/"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              pathname === '/'
                ? 'text-lobster bg-lobster/10'
                : 'text-gray-700 hover:text-lobster hover:bg-gray-50'
            }`}
          >
            {t('nav.home')}
          </Link>
          <Link
            href="/rooms"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isActive('/rooms')
                ? 'text-lobster bg-lobster/10'
                : 'text-gray-700 hover:text-lobster hover:bg-gray-50'
            }`}
          >
            {t('nav.live')}
          </Link>
        </nav>

        {isHome ? (
          <div className="flex-1 min-w-0" aria-hidden />
        ) : (
          <form onSubmit={handleSearch} className="flex-1 max-w-xl min-w-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-full text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-lobster focus:ring-2 focus:ring-lobster/20 transition-all"
            />
          </form>
        )}

        {/* 首页：桌面端发布/登录在左侧栏；移动端仍用顶栏 */}
        <div className={`items-center gap-3 flex-shrink-0 ${isHome ? 'flex lg:hidden' : 'flex'}`}>
          <PublishAndAuthControls variant="header" />
        </div>
      </div>
    </header>
  );
}
