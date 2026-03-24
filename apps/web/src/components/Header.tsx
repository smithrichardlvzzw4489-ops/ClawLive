'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';

export function Header() {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ id: string; username: string; avatarUrl?: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPublishMenu, setShowPublishMenu] = useState(false);

  useEffect(() => {
    if (pathname === '/search') {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const q = params.get('q');
      if (q) setSearchTerm(q);
    }
  }, [pathname]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    router.push('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchTerm)}`);
    }
  };

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b z-50 shadow-sm">
      <div className="h-16 px-6 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-3xl">🦞</span>
          <span className="text-2xl font-bold text-lobster">ClawLive</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              pathname === '/'
                ? 'text-lobster bg-lobster/10'
                : 'text-gray-700 hover:text-lobster hover:bg-gray-50'
            }`}
          >
            {t('nav.home')}
          </Link>
          <Link
            href="/rooms"
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isActive('/rooms')
                ? 'text-lobster bg-lobster/10'
                : 'text-gray-700 hover:text-lobster hover:bg-gray-50'
            }`}
          >
            {t('nav.live')}
          </Link>
        </nav>

        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-full text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-lobster focus:ring-2 focus:ring-lobster/20 transition-all"
          />
        </form>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* 发布入口：下拉多类型 */}
          <div className="relative">
            <button
              onClick={() => setShowPublishMenu(!showPublishMenu)}
              className="px-5 py-2 border border-lobster text-lobster rounded-lg font-medium hover:bg-lobster/5 transition-colors flex items-center gap-2"
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
                <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border py-1 z-50">
                  <Link href={user ? '/works/create' : '/login?redirect=/works/create'} className="block px-4 py-3 hover:bg-gray-50 text-gray-700" onClick={() => setShowPublishMenu(false)}>
                    🦞 {t('nav.publishCoCreate')}
                  </Link>
                  <Link href={user ? '/posts/create' : '/login?redirect=/posts/create'} className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t" onClick={() => setShowPublishMenu(false)}>
                    📝 {t('nav.publishPost')}
                  </Link>
                  <Link href={user ? '/rooms/create' : '/login?redirect=/rooms/create'} className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t" onClick={() => setShowPublishMenu(false)}>
                    📹 {t('nav.publishLive')}
                  </Link>
                </div>
              </>
            )}
          </div>
          {user ? (
            <>
              <div className="relative group">
                <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-lobster text-white flex items-center justify-center font-semibold">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium text-gray-700">{user.username}</span>
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <Link
                    href="/my-profile"
                    className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
                  >
                    👤 {t('nav.myProfile')}
                  </Link>
                  <Link
                    href="/my-agent"
                    className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
                  >
                    🤖 {t('nav.myAgent')}
                  </Link>
                  <Link
                    href="/my-streams"
                    className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
                  >
                    📺 {t('nav.myStreams')}
                  </Link>
                  <Link
                    href="/my-works"
                    className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
                  >
                    📚 {t('nav.myWorks')}
                  </Link>
                  <div className="border-t"></div>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster transition-colors"
                  >
                    {t('logout')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="px-5 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors"
            >
              {t('login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
