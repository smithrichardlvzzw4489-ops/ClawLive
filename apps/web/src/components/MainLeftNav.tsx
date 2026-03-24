'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';

const RAIL_W = 'w-[220px] xl:w-[240px]';

/**
 * 桌面端左侧导航（类小红书：纵向首页 / 直播 + 底部发布与账号）。
 */
export function MainLeftNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  const item = (href: string, label: string, icon: string) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-full px-4 py-3 text-[15px] font-medium transition-colors ${
          active
            ? 'bg-gray-200/90 text-gray-900 font-semibold'
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
      className={`fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] ${RAIL_W} flex-col border-r border-gray-200/60 bg-[#f5f5f5] lg:flex`}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-6">
        {item('/', t('nav.home'), '🏠')}
        {item('/rooms', t('nav.live'), '📺')}
      </nav>
      <div className="shrink-0 border-t border-gray-200/60 px-3 py-4">
        <PublishAndAuthControls variant="sidebar" />
      </div>
    </aside>
  );
}
