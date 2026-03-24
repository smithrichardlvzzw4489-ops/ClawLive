'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';

type Variant = 'header' | 'sidebar';

/**
 * 发布下拉 + 登录/用户菜单，供顶栏与首页左侧栏复用。
 */
export function PublishAndAuthControls({ variant = 'header' }: { variant?: Variant }) {
  const { t } = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; username: string; avatarUrl?: string } | null>(null);
  const [showPublishMenu, setShowPublishMenu] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setUser(u))
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    router.push('/login');
  };

  const menuAlign = variant === 'sidebar' ? 'left-0' : 'right-0';

  return (
    <div className={variant === 'sidebar' ? 'flex flex-col gap-2 w-full' : 'flex items-center gap-3 flex-shrink-0'}>
      <div className={`relative ${variant === 'sidebar' ? 'w-full' : ''}`}>
        <button
          type="button"
          onClick={() => setShowPublishMenu(!showPublishMenu)}
          className={
            variant === 'sidebar'
              ? 'w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-lobster text-lobster rounded-xl font-medium hover:bg-lobster/5 transition-colors text-sm'
              : 'px-5 py-2 border border-lobster text-lobster rounded-lg font-medium hover:bg-lobster/5 transition-colors flex items-center gap-2'
          }
        >
          <span>✏️</span>
          <span>{t('nav.publish')}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showPublishMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPublishMenu(false)} />
            <div className={`absolute ${menuAlign} mt-1 w-56 bg-white rounded-lg shadow-lg border py-1 z-50`}>
              <Link
                href={user ? '/works/create' : '/login?redirect=/works/create'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700"
                onClick={() => setShowPublishMenu(false)}
              >
                🦞 {t('nav.publishCoCreate')}
              </Link>
              <Link
                href={user ? '/posts/create' : '/login?redirect=/posts/create'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                onClick={() => setShowPublishMenu(false)}
              >
                📝 {t('nav.publishPost')}
              </Link>
              <Link
                href={user ? '/rooms/create' : '/login?redirect=/rooms/create'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                onClick={() => setShowPublishMenu(false)}
              >
                📹 {t('nav.publishLive')}
              </Link>
            </div>
          </>
        )}
      </div>

      {user ? (
        <div className={`relative group ${variant === 'sidebar' ? 'w-full' : ''}`}>
          <button
            type="button"
            className={
              variant === 'sidebar'
                ? 'w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors'
                : 'flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors'
            }
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-lobster text-white flex items-center justify-center font-semibold shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-medium text-gray-700 truncate text-left text-sm">{user.username}</span>
            <svg className="w-4 h-4 text-gray-500 shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div
            className={`absolute ${variant === 'sidebar' ? 'left-0 right-0' : 'right-0'} mt-1 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50`}
          >
            <Link
              href="/my-profile"
              className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
            >
              👤 {t('nav.myProfile')}
            </Link>
            <Link href="/my-agent" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors">
              🤖 {t('nav.myAgent')}
            </Link>
            <Link href="/my-streams" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors">
              📺 {t('nav.myStreams')}
            </Link>
            <Link href="/my-works" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors">
              📚 {t('nav.myWorks')}
            </Link>
            <div className="border-t" />
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      ) : (
        <Link
          href="/login"
          className={
            variant === 'sidebar'
              ? 'block text-center px-3 py-2.5 bg-lobster text-white rounded-xl font-medium hover:bg-lobster-dark transition-colors text-sm'
              : 'px-5 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors'
          }
        >
          {t('login')}
        </Link>
      )}
    </div>
  );
}
