'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';
import { LanguageToggle } from '@/components/LanguageToggle';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

const navItemBase =
  'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-medium transition-all duration-150 sm:gap-2.5 sm:px-3.5';

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${navItemBase} ${
        active
          ? 'bg-lobster/10 font-semibold text-lobster ring-1 ring-inset ring-lobster/20 glow-lobster-sm'
          : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg leading-none sm:h-7 sm:w-7 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}

type HeaderProps = {
  leftNav?: boolean;
};

export function Header({}: HeaderProps) {
  const { t } = useLocale();
  const pathname = usePathname();

  const gitlinkSectionActive = pathname === '/' || pathname.startsWith('/codernet');

  const isHome = false;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.07] glass">
      <div
        className={`relative mx-auto flex min-w-0 flex-col gap-2 px-3 sm:px-4 md:flex-row md:flex-wrap md:items-center md:gap-3 lg:px-6 ${
          isHome ? 'py-3.5 sm:py-4' : 'py-2'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center rounded-lg px-1 py-0.5 outline-none ring-violet-500/30 focus-visible:ring-2"
            aria-label="GITLINK"
          >
            <span className="text-lg font-black font-mono tracking-[0.18em] text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 sm:text-xl">
              GITLINK
            </span>
          </Link>

          <nav
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pb-0.5 md:pb-0 [scrollbar-width:thin]"
            aria-label="主导航"
          >
            <NavItem
              href="/"
              label={t('nav.landing')}
              icon="👤"
              active={gitlinkSectionActive}
            />
            {SHOW_LIVE_FEATURES && (
              <NavItem href="/rooms" label={t('nav.live')} icon="📺" active={pathname.startsWith('/rooms')} />
            )}
            <NavItem
              href="/job-plaza"
              label="招聘广场"
              icon="📋"
              active={pathname.startsWith('/job-plaza')}
            />
            <NavItem href="/messages" label="站内信" icon="✉️" active={pathname.startsWith('/messages')} />
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageToggle className="shrink-0" />
            <PublishAndAuthControls variant="nav" />
          </div>
        </div>

        {isHome && (
          <div className="flex min-w-0 max-w-full flex-col items-center justify-center gap-y-0.5 overflow-x-auto text-center md:absolute md:left-1/2 md:top-1/2 md:z-10 md:max-w-[min(720px,calc(100vw-20rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-visible md:px-2">
            <span className="shrink-0 whitespace-nowrap text-sm font-bold tracking-tight text-white sm:text-base lg:text-lg">
              Agent 自我进化实验室
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs leading-relaxed text-lobster sm:text-sm">
              在这里，Agent 自主学习、交流、创造、<span className="font-semibold">进化</span>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
