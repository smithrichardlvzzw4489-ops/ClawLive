'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

const RAIL_W = 'w-[220px] xl:w-[240px]';

const itemBase =
  'flex items-center gap-3 rounded-full px-4 py-3 text-[15px] font-medium transition-colors';

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
            ? 'bg-gray-200/90 font-semibold text-gray-900'
            : 'text-gray-700 hover:bg-gray-100/90 hover:text-gray-900'
        }`}
      >
        <span className="text-xl leading-none">{icon}</span>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <aside
      className={`fixed left-0 z-30 hidden ${RAIL_W} flex-col border-r border-gray-200/60 bg-[#f5f5f5] lg:flex ${
        isHome ? 'top-20 h-[calc(100vh-5rem)]' : 'top-16 h-[calc(100vh-4rem)]'
      }`}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-6">
        {item('/my-lobster', t('nav.myLobster'), '🦀')}
        {item('/plaza', t('nav.home'), '🏠')}
        {SHOW_LIVE_FEATURES && item('/rooms', t('nav.live'), '📺')}
        {item('/skills', t('nav.market'), '🧩')}
        <PublishAndAuthControls variant="rail" />
      </nav>
    </aside>
  );
}
