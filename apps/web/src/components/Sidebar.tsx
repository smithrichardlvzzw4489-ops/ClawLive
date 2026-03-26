'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { BRAND_ZH } from '@/lib/brand';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLocale();

  const navItems = [
    { icon: '🏠', label: t('nav.home'), path: '/' },
    ...(SHOW_LIVE_FEATURES ? [{ icon: '🎬', label: t('nav.live'), path: '/rooms' }] : []),
    { icon: '📚', label: t('nav.works'), path: '/my-profile' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-52 bg-white border-r overflow-y-auto">
      <nav className="py-4">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex items-center gap-3 px-6 py-3 transition-all ${
              isActive(item.path)
                ? 'bg-lobster/10 text-lobster font-semibold border-r-4 border-lobster'
                : 'text-gray-700 hover:bg-gray-50 hover:text-lobster'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {BRAND_ZH} v1.0
          <br />
          MIT License
        </p>
      </div>
    </aside>
  );
}
