'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';
import { BRAND_ZH } from '@/lib/brand';

type HeaderProps = {
  /**
   * 为 true 时：lg+ 顶栏仅 Logo + 搜索，主导航在 MainLeftNav。
   * 为 false 时：顶栏始终含首页/直播/发布/登录（沉浸式页等）。
   */
  leftNav?: boolean;
};

export function Header({ leftNav = true }: HeaderProps) {
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

  const navLink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-2 text-[15px] font-medium transition-colors sm:px-4 ${
        active ? 'bg-gray-200/90 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-100/90 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  );

  const isHome = pathname === '/';
  const searchInputClass =
    'w-full rounded-full border border-gray-200/80 bg-white/90 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-lobster/20';

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-[#f5f5f5] shadow-sm">
      <div className="relative mx-auto flex min-w-0 flex-col gap-2 px-3 py-2 sm:px-4 md:flex-row md:items-center md:gap-3 lg:px-6">
        <div
          className={`flex min-w-0 items-center justify-between gap-2 md:justify-start md:gap-1 ${isHome ? 'md:flex-1' : 'shrink-0'}`}
        >
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="text-3xl leading-none">🦞</span>
            <span className="text-xl font-bold tracking-tight text-lobster sm:text-2xl">{BRAND_ZH}</span>
          </Link>

          {leftNav ? (
            <div className="flex min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto md:hidden">
              <nav className="flex shrink-0 items-center gap-0.5">
                {navLink('/', t('nav.home'), pathname === '/')}
                {navLink('/rooms', t('nav.live'), isActive('/rooms'))}
                {navLink('/points', t('nav.points'), isActive('/points'))}
              </nav>
              <PublishAndAuthControls variant="nav" />
            </div>
          ) : (
            <>
              <nav className="ml-0.5 flex shrink-0 items-center gap-0.5 sm:ml-1">
                {navLink('/', t('nav.home'), pathname === '/')}
                {navLink('/rooms', t('nav.live'), isActive('/rooms'))}
                {navLink('/points', t('nav.points'), isActive('/points'))}
              </nav>
              <PublishAndAuthControls variant="nav" />
            </>
          )}

          <form
            onSubmit={handleSearch}
            className="max-w-[200px] shrink-0 sm:max-w-[220px] md:hidden"
          >
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className={searchInputClass}
            />
          </form>
        </div>

        {isHome && (
          <div className="flex min-w-0 max-w-full flex-nowrap items-baseline justify-center gap-x-3 overflow-x-auto text-center md:absolute md:left-1/2 md:top-1/2 md:z-10 md:max-w-[min(720px,calc(100vw-20rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-visible md:px-2 lg:gap-x-4">
            <span className="shrink-0 whitespace-nowrap text-sm font-bold tracking-tight text-gray-900 sm:text-base lg:text-lg">
              {t('home.heroTitle')}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs leading-relaxed text-gray-600 sm:text-sm">
              {t('home.heroSubtitle')}
            </span>
          </div>
        )}

        <div
          className={`hidden min-w-0 md:flex md:flex-1 md:items-center md:justify-end ${isHome ? '' : 'md:ml-auto'}`}
        >
          <form
            onSubmit={handleSearch}
            className="w-full max-w-[200px] shrink-0 sm:max-w-[220px] lg:max-w-[240px]"
          >
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className={searchInputClass}
            />
          </form>
        </div>
      </div>
    </header>
  );
}
