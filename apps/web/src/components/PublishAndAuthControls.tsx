'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';
import { API_BASE_URL } from '@/lib/api';

type Variant = 'nav' | 'sidebar' | 'rail';

/** 与左侧栏「首页」「直播」链接同款：圆角条、字重 */
const railRow =
  'flex w-full items-center gap-3 rounded-full px-4 py-3 text-[15px] font-medium transition-colors text-gray-700 hover:bg-gray-100/90 hover:text-gray-900';
const railRowOpen = 'bg-gray-200/90 text-gray-900 font-semibold';

const navBtn =
  'rounded-full px-3 py-2 text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-100/90 hover:text-gray-900 flex items-center gap-1 shrink-0 sm:px-4';

/**
 * 发布下拉 + 登录/用户菜单。nav：与顶栏「首页」「直播」同款字重与圆角。
 */
export function PublishAndAuthControls({ variant = 'nav' }: { variant?: Variant }) {
  const { t } = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; username: string; avatarUrl?: string } | null>(null);
  const [showPublishMenu, setShowPublishMenu] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/api/auth/me`, {
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

  const menuAlign = variant === 'sidebar' || variant === 'rail' ? 'left-0' : 'right-0';

  if (variant === 'rail') {
    return (
      <div className="flex w-full flex-col gap-0.5">
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => setShowPublishMenu(!showPublishMenu)}
            className={`${railRow} ${showPublishMenu ? railRowOpen : ''}`}
          >
            <span className="text-xl leading-none">✏️</span>
            <span className="flex-1 text-left">{t('nav.publish')}</span>
            <svg className="h-4 w-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showPublishMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowPublishMenu(false)} />
              <div className={`absolute ${menuAlign} left-0 right-0 z-50 mt-1 rounded-xl border bg-white py-1 shadow-lg`}>
                {/* [FEATURE:CO_CREATE] 与龙虾共创入口 — 已隐藏，恢复时删除此注释块 START
                <Link
                  href={user ? '/works/create' : '/login?redirect=/works/create'}
                  className="block px-4 py-3 text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowPublishMenu(false)}
                >
                  🦞 {t('nav.publishCoCreate')}
                </Link>
                [FEATURE:CO_CREATE] END */}
                <Link
                  href={user ? '/posts/create' : '/login?redirect=/posts/create'}
                  className="block border-t px-4 py-3 text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowPublishMenu(false)}
                >
                  📝 {t('nav.publishPost')}
                </Link>
                <Link
                  href={user ? '/posts/create-image-text' : '/login?redirect=/posts/create-image-text'}
                  className="block border-t px-4 py-3 text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowPublishMenu(false)}
                >
                  🖼️ {t('nav.publishImageText')}
                </Link>
                <Link
                  href={user ? '/works/create-video' : '/login?redirect=/works/create-video'}
                  className="block border-t px-4 py-3 text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowPublishMenu(false)}
                >
                  🎬 {t('nav.publishVideo')}
                </Link>
                {SHOW_LIVE_FEATURES && (
                  <Link
                    href={user ? '/rooms/create' : '/login?redirect=/rooms/create'}
                    className="block border-t px-4 py-3 text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowPublishMenu(false)}
                  >
                    📹 {t('nav.publishLive')}
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
        {user ? (
          <div className="relative group w-full">
            <button type="button" className={`${railRow} w-full`}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
                  {user.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-left">{user.username}</span>
              <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="invisible absolute left-0 right-0 z-50 mt-1 w-full rounded-xl border bg-white opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
              <Link href="/my-profile" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 hover:text-lobster">
                👤 {t('nav.myProfile')}
              </Link>
              <Link href="/my-agent" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 hover:text-lobster">
                🤖 {t('nav.myAgent')}
              </Link>
              <Link href="/points" className="block px-4 py-3 text-gray-700 hover:bg-gray-50 hover:text-lobster">
                💎 {t('nav.points')}
              </Link>
              <div className="border-t" />
              <button
                type="button"
                onClick={handleLogout}
                className="block w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 hover:text-lobster"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        ) : (
          <Link href="/login" className={railRow}>
            <span className="text-xl leading-none">👤</span>
            <span>{t('login')}</span>
          </Link>
        )}
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className="flex flex-col gap-2 w-full">
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => setShowPublishMenu(!showPublishMenu)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-lobster text-lobster rounded-xl font-medium hover:bg-lobster/5 transition-colors text-sm"
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
                {/* [FEATURE:CO_CREATE] 与龙虾共创入口 — 已隐藏，恢复时删除此注释块 START
                <Link
                  href={user ? '/works/create' : '/login?redirect=/works/create'}
                  className="block px-4 py-3 hover:bg-gray-50 text-gray-700"
                  onClick={() => setShowPublishMenu(false)}
                >
                  🦞 {t('nav.publishCoCreate')}
                </Link>
                [FEATURE:CO_CREATE] END */}
                <Link
                  href={user ? '/posts/create' : '/login?redirect=/posts/create'}
                  className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                  onClick={() => setShowPublishMenu(false)}
                >
                  📝 {t('nav.publishPost')}
                </Link>
                <Link
                  href={user ? '/posts/create-image-text' : '/login?redirect=/posts/create-image-text'}
                  className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                  onClick={() => setShowPublishMenu(false)}
                >
                  🖼️ {t('nav.publishImageText')}
                </Link>
                <Link
                  href={user ? '/works/create-video' : '/login?redirect=/works/create-video'}
                  className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                  onClick={() => setShowPublishMenu(false)}
                >
                  🎬 {t('nav.publishVideo')}
                </Link>
                {SHOW_LIVE_FEATURES && (
                  <Link
                    href={user ? '/rooms/create' : '/login?redirect=/rooms/create'}
                    className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                    onClick={() => setShowPublishMenu(false)}
                  >
                    📹 {t('nav.publishLive')}
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
        {user ? (
          <div className="relative group w-full">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-lobster text-white flex items-center justify-center font-semibold shrink-0">
                  {user.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-medium text-gray-700 truncate text-left text-sm">{user.username}</span>
            </button>
            <div className="absolute left-0 right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <Link href="/my-profile" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster">
                👤 {t('nav.myProfile')}
              </Link>
              <Link href="/my-agent" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster">
                🤖 {t('nav.myAgent')}
              </Link>
              <Link href="/points" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster">
                💎 {t('nav.points')}
              </Link>
              <div className="border-t" />
              <button
                type="button"
                onClick={handleLogout}
                className="block w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            className="block text-center px-3 py-2.5 bg-lobster text-white rounded-xl font-medium hover:bg-lobster-dark transition-colors text-sm"
          >
            {t('login')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPublishMenu(!showPublishMenu)}
          className={navBtn}
        >
          <span>{t('nav.publish')}</span>
          <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showPublishMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPublishMenu(false)} />
            <div className={`absolute ${menuAlign} mt-1 w-56 bg-white rounded-lg shadow-lg border py-1 z-50`}>
              {/* [FEATURE:CO_CREATE] 与龙虾共创入口 — 已隐藏，恢复时删除此注释块 START
              <Link
                href={user ? '/works/create' : '/login?redirect=/works/create'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700"
                onClick={() => setShowPublishMenu(false)}
              >
                🦞 {t('nav.publishCoCreate')}
              </Link>
              [FEATURE:CO_CREATE] END */}
              <Link
                href={user ? '/posts/create' : '/login?redirect=/posts/create'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                onClick={() => setShowPublishMenu(false)}
              >
                📝 {t('nav.publishPost')}
              </Link>
              <Link
                href={user ? '/posts/create-image-text' : '/login?redirect=/posts/create-image-text'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                onClick={() => setShowPublishMenu(false)}
              >
                🖼️ {t('nav.publishImageText')}
              </Link>
              <Link
                href={user ? '/works/create-video' : '/login?redirect=/works/create-video'}
                className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                onClick={() => setShowPublishMenu(false)}
              >
                🎬 {t('nav.publishVideo')}
              </Link>
              {SHOW_LIVE_FEATURES && (
                <Link
                  href={user ? '/rooms/create' : '/login?redirect=/rooms/create'}
                  className="block px-4 py-3 hover:bg-gray-50 text-gray-700 border-t"
                  onClick={() => setShowPublishMenu(false)}
                >
                  📹 {t('nav.publishLive')}
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      {user ? (
        <div className="relative group">
          <button type="button" className={navBtn}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-lobster/15 text-lobster flex items-center justify-center text-sm font-semibold shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-[6rem] truncate">{user.username}</span>
            <svg className="w-4 h-4 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <Link href="/my-profile" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster">
              👤 {t('nav.myProfile')}
            </Link>
            <Link href="/my-agent" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster">
              🤖 {t('nav.myAgent')}
            </Link>
            <Link href="/points" className="block px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster">
              💎 {t('nav.points')}
            </Link>
            <div className="border-t" />
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 hover:text-lobster"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      ) : (
        <Link href="/login" className={navBtn}>
          {t('login')}
        </Link>
      )}
    </div>
  );
}
