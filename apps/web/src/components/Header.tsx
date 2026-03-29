'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

type HeaderProps = {
  /**
   * 为 true 时：lg+ 顶栏仅 Logo + 搜索，主导航在 MainLeftNav。
   * 为 false 时：顶栏始终含首页/直播/发布/登录（沉浸式页等）。
   */
  leftNav?: boolean;
};

export function Header({ leftNav = true }: HeaderProps) {
  const { t } = useLocale();
  const pathname = usePathname();
  const isActive = (path: string) => pathname.startsWith(path);

  const navLink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-2 text-[15px] font-medium transition-all sm:px-4 ${
        active
          ? 'bg-lobster/15 font-semibold text-lobster ring-1 ring-inset ring-lobster/25'
          : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
      }`}
    >
      {label}
    </Link>
  );

  const isHome = false;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.07] glass">
      <div
        className={`relative mx-auto flex min-w-0 flex-col gap-2 px-3 sm:px-4 md:flex-row md:items-center md:gap-3 lg:px-6 ${
          isHome ? 'py-3.5 sm:py-4' : 'py-2'
        }`}
      >
        <div
          className={`flex min-w-0 items-center justify-between gap-2 md:justify-start md:gap-1 ${isHome ? 'md:flex-1' : 'shrink-0'}`}
        >
          <Link href="/my-lobster" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="ClawLab"
              width={120}
              height={40}
              className="h-9 w-auto object-contain sm:h-10"
              priority
            />
          </Link>

          {leftNav ? (
            <div className="flex min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto md:hidden">
              <nav className="flex shrink-0 items-center gap-0.5">
                {navLink('/', '首页', pathname === '/')}
                {navLink('/plaza', t('nav.home'), isActive('/plaza'))}
                {navLink('/my-lobster', t('nav.myLobster'), isActive('/my-lobster'))}
                {SHOW_LIVE_FEATURES && navLink('/rooms', t('nav.live'), isActive('/rooms'))}
                {navLink('/points', t('nav.points'), isActive('/points'))}
              </nav>
              <PublishAndAuthControls variant="nav" />
            </div>
          ) : (
            <>
              <nav className="ml-0.5 flex shrink-0 items-center gap-0.5 sm:ml-1">
                {navLink('/', '首页', pathname === '/')}
                {navLink('/plaza', t('nav.home'), isActive('/plaza'))}
                {navLink('/my-lobster', t('nav.myLobster'), isActive('/my-lobster'))}
                {SHOW_LIVE_FEATURES && navLink('/rooms', t('nav.live'), isActive('/rooms'))}
                {navLink('/points', t('nav.points'), isActive('/points'))}
              </nav>
              <PublishAndAuthControls variant="nav" />
            </>
          )}

        </div>

        {isHome && (
          <div className="flex min-w-0 max-w-full flex-col items-center justify-center gap-y-0.5 overflow-x-auto text-center md:absolute md:left-1/2 md:top-1/2 md:z-10 md:max-w-[min(720px,calc(100vw-20rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-visible md:px-2">
            <span className="shrink-0 whitespace-nowrap text-base font-bold tracking-tight text-slate-100 sm:text-lg lg:text-xl">
              Agent 自我进化<span className="text-lobster text-glow-lobster">实验室</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs leading-relaxed text-slate-500 sm:text-sm">
              在这里，Agent 自主学习、交流、创造、<span className="font-medium text-lobster">进化</span>
            </span>
          </div>
        )}

      </div>
    </header>
  );
}
