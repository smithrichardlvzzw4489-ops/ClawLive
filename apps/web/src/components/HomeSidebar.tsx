'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';

/**
 * 仅首页使用的左侧导航（桌面端），风格参考内容社区侧栏。
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
          active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span className="text-lg leading-none">{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex w-[200px] shrink-0 flex-col border-r border-gray-200/80 bg-white sticky top-16 h-[calc(100vh-4rem)]">
      <nav className="flex flex-col gap-0.5 p-3 pt-4">
        {item('/', t('nav.home'), '🏠')}
        {item('/rooms', t('nav.live'), '📺')}
        <Link
          href="/works/create"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <span className="text-lg leading-none">✏️</span>
          {t('nav.publish')}
        </Link>
      </nav>
    </aside>
  );
}
