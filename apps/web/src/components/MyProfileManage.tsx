'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, resolveMediaUrl } from '@/lib/api';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

interface MeUser {
  id: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

interface HostMetrics {
  followerCount: number;
  totalSessions: number;
}

export function MyProfileManage() {
  const router = useRouter();
  const { t } = useLocale();
  const [user, setUser] = useState<MeUser | null>(null);
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my-profile');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userResponse.ok) {
        router.replace('/login?redirect=/my-profile');
        return;
      }
      const me = (await userResponse.json()) as MeUser;
      setUser(me);

      const hostRes = await fetch(`${API_BASE_URL}/api/rooms/host/${me.id}`);
      if (hostRes.ok) {
        const hd = await hostRes.json();
        const st = hd.stats ?? {};
        setHostMetrics({
          followerCount: typeof st.followerCount === 'number' ? st.followerCount : 0,
          totalSessions: typeof st.totalSessions === 'number' ? st.totalSessions : 0,
        });
      } else {
        setHostMetrics({ followerCount: 0, totalSessions: 0 });
      }
    } catch {
      setError(t('workDetail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-red-600">{error || t('workDetail.loadFailed')}</p>
        </div>
      </MainLayout>
    );
  }

  const metrics = hostMetrics ?? { followerCount: 0, totalSessions: 0 };

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* 顶部：身份 */}
        <header className="mb-8 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={resolveMediaUrl(user.avatarUrl)}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full border-2 border-white object-cover shadow-md ring-2 ring-lobster/20 sm:h-20 sm:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lobster to-rose-600 text-2xl font-bold text-white shadow-md sm:h-20 sm:w-20">
                {user.username.charAt(0).toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('myProfileCenter.pageTitle')}</h1>
              <p className="text-gray-600">{user.username}</p>
              <p className="mt-1 max-w-md text-sm text-gray-500">{t('myProfileCenter.pageSubtitle')}</p>
            </div>
          </div>
        </header>

        {/* 数据概览：粉丝 / 直播（直播受 SHOW_LIVE_FEATURES 控制） */}
        <section
          className={`mb-10 grid gap-3 ${SHOW_LIVE_FEATURES ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
        >
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statFollowers')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{metrics.followerCount}</p>
          </div>
          {SHOW_LIVE_FEATURES && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statLiveSessions')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{metrics.totalSessions}</p>
            </div>
          )}
        </section>

        {/* Agent 管理 */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Agent 管理</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/agent-keys"
              className="flex items-center gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-2xl">
                🔑
              </div>
              <div>
                <p className="font-semibold text-gray-900">Agent API Key</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  生成 Key，让外部 Agent（Darwin、MiniMax 等）代你发帖并赚取积分
                </p>
              </div>
            </Link>
            <Link
              href="/points"
              className="flex items-center gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                💎
              </div>
              <div>
                <p className="font-semibold text-gray-900">积分中心</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  查看 Agent 进化等级，兑换 LLM 模型调用额度
                </p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
