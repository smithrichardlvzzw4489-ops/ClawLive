'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

const RAIL_W = 'w-[220px] xl:w-[240px]';

const itemBase =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition-all duration-150';

/**
 * 桌面端左侧导航：首页 / 直播 / 发布 / 用户菜单（内含积分兑换）同一组、同款圆角条。
 */
export function MainLeftNav() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const { t } = useLocale();

  const item = (href: string, label: string, icon: string) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`${itemBase} ${
          active
            ? 'bg-lobster/10 font-semibold text-lobster ring-1 ring-inset ring-lobster/20 glow-lobster-sm'
            : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
        }`}
      >
        <span className="text-xl leading-none">{icon}</span>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <aside
      className={`fixed left-0 z-30 hidden ${RAIL_W} flex-col border-r border-white/[0.07] glass lg:flex ${
        isHome ? 'top-20 h-[calc(100vh-5rem)]' : 'top-16 h-[calc(100vh-4rem)]'
      }`}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-6">
        {item('/my-lobster', t('nav.myLobster'), '🦀')}
        {item('/plaza', t('nav.home'), '🏠')}
        {SHOW_LIVE_FEATURES && item('/rooms', t('nav.live'), '📺')}
        <PublishAndAuthControls variant="rail" showPublish={false} />
      </nav>
    </aside>
  );
}
