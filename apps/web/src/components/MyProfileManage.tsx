'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, APIError, api, resolveMediaUrl } from '@/lib/api';
import { RecruiterOutboundEmailSection } from '@/components/my/RecruiterOutboundEmailSection';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';
import { usePrimaryPersona } from '@/contexts/PrimaryPersonaContext';

interface MeUser {
  id: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  githubUsername?: string | null;
  recruiterOutboundEmail?: string | null;
}

interface HostMetrics {
  followerCount: number;
  totalSessions: number;
}

/** 与 GET /api/works/user/:id 返回的 stats 一致（仅已发布计入 totalWorks） */
interface WorksStats {
  totalWorks: number;
  totalViews: number;
  totalLikes: number;
}

export function MyProfileManage() {
  const router = useRouter();
  const { t } = useLocale();
  const { persona, personaReady } = usePrimaryPersona();
  const [user, setUser] = useState<MeUser | null>(null);
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [worksStats, setWorksStats] = useState<WorksStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftUsername, setDraftUsername] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileSavedFlash, setProfileSavedFlash] = useState(false);

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

      const [hostRes, worksRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/rooms/host/${me.id}`),
        fetch(`${API_BASE_URL}/api/works/user/${encodeURIComponent(me.id)}?includeDrafts=true`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

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

      if (worksRes.ok) {
        const wd = (await worksRes.json()) as { stats?: WorksStats };
        const s = wd.stats;
        setWorksStats(
          s
            ? {
                totalWorks: typeof s.totalWorks === 'number' ? s.totalWorks : 0,
                totalViews: typeof s.totalViews === 'number' ? s.totalViews : 0,
                totalLikes: typeof s.totalLikes === 'number' ? s.totalLikes : 0,
              }
            : { totalWorks: 0, totalViews: 0, totalLikes: 0 },
        );
      } else {
        setWorksStats({ totalWorks: 0, totalViews: 0, totalLikes: 0 });
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

  useEffect(() => {
    if (!user) return;
    setDraftUsername(user.username);
    setDraftBio(user.bio ?? '');
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    const u = draftUsername.trim();
    const b = draftBio.trim();
    if (u === user.username && (b || '') === (user.bio ?? '')) return;
    setSavingProfile(true);
    setProfileSaveError('');
    try {
      const updated = (await api.auth.updateMe({
        username: u,
        bio: b === '' ? null : b,
      })) as MeUser;
      setUser(updated);
      setProfileSavedFlash(true);
      setTimeout(() => setProfileSavedFlash(false), 2500);
    } catch (e) {
      const code = e instanceof APIError ? e.message : '';
      if (code === 'USERNAME_TAKEN') {
        setProfileSaveError(t('myProfileCenter.profileUsernameTaken'));
      } else if (code === 'USERNAME_INVALID' || code === 'USERNAME_LENGTH') {
        setProfileSaveError(t('myProfileCenter.profileUsernameInvalid'));
      } else if (code === 'BIO_TOO_LONG') {
        setProfileSaveError(t('myProfileCenter.profileBioTooLong'));
      } else {
        setProfileSaveError(t('myProfileCenter.profileSaveFailed'));
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const profileDirty =
    user &&
    (draftUsername.trim() !== user.username || (draftBio.trim() || '') !== (user.bio ?? ''));

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
  const ws = worksStats ?? { totalWorks: 0, totalViews: 0, totalLikes: 0 };

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* 顶部：身份 */}
        <header className="mb-8 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
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
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('myProfileCenter.pageTitle')}</h1>
                <p className="mt-1 max-w-xl text-sm text-gray-500">{t('myProfileCenter.pageSubtitle')}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="profile-username" className="block text-xs font-medium text-gray-500">
                    {t('myProfileCenter.profileUsername')}
                  </label>
                  <input
                    id="profile-username"
                    type="text"
                    autoComplete="username"
                    value={draftUsername}
                    onChange={(e) => setDraftUsername(e.target.value)}
                    className="mt-1 w-full max-w-md rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-lobster/40 focus:ring-2 focus:ring-lobster/15"
                  />
                  <p className="mt-1 text-xs text-gray-400">{t('myProfileCenter.profileUsernameHint')}</p>
                </div>
                <div>
                  <label htmlFor="profile-bio" className="block text-xs font-medium text-gray-500">
                    {t('myProfileCenter.profileBio')}
                  </label>
                  <textarea
                    id="profile-bio"
                    rows={3}
                    value={draftBio}
                    onChange={(e) => setDraftBio(e.target.value)}
                    placeholder={t('myProfileCenter.profileBioPlaceholder')}
                    className="mt-1 w-full max-w-xl resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-lobster/40 focus:ring-2 focus:ring-lobster/15"
                  />
                </div>
                {user && personaReady && persona === 'recruiter' ? (
                  <RecruiterOutboundEmailSection
                    initialEmail={user.recruiterOutboundEmail ?? null}
                    onSaved={(email) => setUser((prev) => (prev ? { ...prev, recruiterOutboundEmail: email } : prev))}
                    variant="light"
                  />
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={savingProfile || !profileDirty}
                    onClick={() => void handleSaveProfile()}
                    className="rounded-xl bg-lobster px-4 py-2 text-sm font-semibold text-white transition hover:bg-lobster-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProfile ? '…' : t('myProfileCenter.profileSave')}
                  </button>
                  {profileSavedFlash && (
                    <span className="text-sm text-green-600">{t('myProfileCenter.profileSaved')}</span>
                  )}
                  {profileSaveError && <span className="text-sm text-red-600">{profileSaveError}</span>}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 数据概览：粉丝 / 直播；下方作品入口 */}
        <section className="mb-10 flex flex-col gap-3">
          <div
            className={`grid gap-3 ${SHOW_LIVE_FEATURES ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
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
          </div>
          <Link
            href="/my-profile/works"
            className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-lobster/25 hover:shadow-md"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statWorks')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{ws.totalWorks}</p>
            <p className="mt-2 text-xs text-gray-400">{t('myProfileCenter.statWorksHint')}</p>
          </Link>
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
                  生成 Key，让外部 Agent（GITLINK、MiniMax 等）代你发帖并赚取积分
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
