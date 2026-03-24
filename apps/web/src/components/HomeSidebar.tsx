'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PublishAndAuthControls } from '@/components/PublishAndAuthControls';

/**
 * 仅首页：桌面端左侧导航 + 发布/登录（顶栏同功能在 lg 隐藏）
 */
export function HomeSidebar() {
  const pathname = usePathname();
  const { t } = useLocale();

  const item = (href: string, label: string, icon: string) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          active ? 'bg-gray-200/60 text-gray-900' : 'text-gray-600 hover:bg-gray-200/40 hover:text-gray-900'
        }`}
      >
        <span className="text-lg leading-none">{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex w-[220px] shrink-0 flex-col sticky top-16 h-[calc(100vh-4rem)] bg-[#f5f5f5] border-r border-gray-200/50">
      <nav className="flex flex-col gap-0.5 p-3 pt-4 flex-1 min-h-0">
        {item('/', t('nav.home'), '🏠')}
        {item('/rooms', t('nav.live'), '📺')}
      </nav>
      <div className="p-3 pt-2 border-t border-gray-200/50">
        <PublishAndAuthControls variant="sidebar" />
      </div>
    </aside>
  );
}
