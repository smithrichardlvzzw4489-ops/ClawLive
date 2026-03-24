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

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/50 bg-[#f5f5f5] shadow-sm">
      <div className="mx-auto flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-4 md:grid md:h-16 md:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] md:items-center md:gap-2 lg:px-6">
        <div className="flex min-w-0 items-center gap-0.5 md:col-start-1 md:justify-self-start md:gap-1">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="text-3xl leading-none">🦞</span>
            <span className="text-xl font-bold tracking-tight text-lobster sm:text-2xl">{BRAND_ZH}</span>
          </Link>

          {leftNav ? (
            <div className="flex min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto md:hidden">
              <nav className="flex shrink-0 items-center gap-0.5">
                {navLink('/', t('nav.home'), pathname === '/')}
                {navLink('/rooms', t('nav.live'), isActive('/rooms'))}
              </nav>
              <PublishAndAuthControls variant="nav" />
            </div>
          ) : (
            <>
              <nav className="ml-0.5 flex shrink-0 items-center gap-0.5 sm:ml-1">
                {navLink('/', t('nav.home'), pathname === '/')}
                {navLink('/rooms', t('nav.live'), isActive('/rooms'))}
              </nav>
              <PublishAndAuthControls variant="nav" />
            </>
          )}
        </div>

        <form
          onSubmit={handleSearch}
          className="min-w-0 flex-1 md:col-start-2 md:w-full md:flex-none md:max-w-none md:justify-self-center"
        >
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-full border border-gray-200/80 bg-white/90 px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-lobster/20"
          />
        </form>

        <div className="hidden min-h-0 md:col-start-3 md:block md:justify-self-stretch" aria-hidden />
      </div>
    </header>
  );
}
