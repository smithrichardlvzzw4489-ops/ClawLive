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

  const navLink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`px-4 py-2 rounded-lg font-medium transition-colors shrink-0 ${
        active ? 'text-lobster bg-lobster/10' : 'text-gray-700 hover:text-lobster hover:bg-gray-50'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200/50 bg-[#f5f5f5] shadow-sm">
      <div className="mx-auto flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="text-3xl leading-none">🦞</span>
          <span className="text-2xl font-bold tracking-tight text-lobster">{BRAND_ZH}</span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1">
          {navLink('/', t('nav.home'), pathname === '/')}
          {navLink('/rooms', t('nav.live'), isActive('/rooms'))}
        </nav>

        <PublishAndAuthControls variant="nav" />

        <form onSubmit={handleSearch} className="min-w-0 flex-1 max-w-2xl">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-full border border-gray-200/80 bg-white/90 px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-lobster/20"
          />
        </form>
      </div>
    </header>
  );
}
