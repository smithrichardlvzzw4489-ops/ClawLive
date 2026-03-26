'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { RoomCard } from '@/components/RoomCard';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, resolveMediaUrl } from '@/lib/api';

interface Host {
  id: string;
  username: string;
  bio?: string;
  tagline?: string;
  tags?: string[];
  avatarUrl?: string;
}

interface Room {
  id: string;
  title: string;
  lobsterName: string;
  description?: string;
  isLive: boolean;
  startedAt?: Date;
  endedAt?: Date;
  viewerCount: number;
  messageCount?: number;
}

interface HostWork {
  id: string;
  /** 传统作品 / 写文章图文 */
  kind?: 'work' | 'feedPost';
  title: string;
  resultSummary?: string;
  partition?: string;
  coverImage?: string;
  videoUrl?: string;
  viewCount: number;
  likeCount: number;
  publishedAt?: Date | string;
}

interface HostSkill {
  id: string;
  title: string;
  description?: string;
  viewCount: number;
  useCount: number;
  sourceWorkId?: string;
}

interface HostData {
  host: Host;
  liveRooms: Room[];
  historySessions: Room[];
  hostWorks: HostWork[];
  hostSkills: HostSkill[];
  stats: {
    followerCount: number;
    workCount: number;
    skillCount: number;
    answerCount: number;
    totalSessions: number;
    totalMessages: number;
  };
}

type TabKey = 'overview' | 'works';

/** 对外展示的创作者主页（访客视角）；个人管理请使用 `/my-profile` */
export function HostProfileView({ hostId }: { hostId: string }) {
  const { t } = useLocale();
  const [data, setData] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  useEffect(() => {
    const fetchHostData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/rooms/host/${hostId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch host data');
        }

        const hostData = await response.json();
        setData(hostData);
      } catch (err: any) {
        setError(err.message || 'Failed to load host data');
      } finally {
        setLoading(false);
      }
    };

    fetchHostData();
  }, [hostId]);

  useEffect(() => {
    const checkAuthAndFollow = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setIsLoggedIn(false);
        return;
      }
      try {
        const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok) {
          setIsLoggedIn(false);
          return;
        }
        const me = await meRes.json();
        setIsLoggedIn(true);
        setCurrentUserId(me.id);
        if (me.id === hostId) return;
        const followRes = await fetch(`${API_BASE_URL}/api/user-follows/check/${hostId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (followRes.ok) {
          const { following: f } = await followRes.json();
          setFollowing(f);
        }
      } catch {
        setIsLoggedIn(false);
      }
    };
    checkAuthAndFollow();
  }, [hostId]);

  const toggleFollow = async () => {
    if (!isLoggedIn || isToggling || currentUserId === hostId) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    setIsToggling(true);
    try {
      const method = following ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE_URL}/api/user-follows/${hostId}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFollowing(!following);
        setData((prev) =>
          prev
            ? {
                ...prev,
                stats: {
                  ...prev.stats,
                  followerCount: prev.stats.followerCount + (following ? -1 : 1),
                },
              }
            : null
        );
      }
    } finally {
      setIsToggling(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !data) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || t('history.loadFailed')}</p>
            <Link href="/rooms" className="text-lobster hover:underline">
              {t('history.backToList')}
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  const { host, liveRooms, hostWorks = [], stats } = data;
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('host.tabOverview') },
    { key: 'works', label: t('host.tabWorks') },
  ];

  const WorkCard = ({ work }: { work: HostWork }) => (
    <Link
      href={work.kind === 'feedPost' ? `/posts/${work.id}` : `/works/${work.id}`}
      className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden"
    >
      <div className="aspect-video bg-gray-100 flex items-center justify-center">
        {work.videoUrl ? (
          <video src={resolveMediaUrl(work.videoUrl)} className="w-full h-full object-cover" muted playsInline />
        ) : work.coverImage ? (
          <img src={resolveMediaUrl(work.coverImage)} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl opacity-40">🖼️</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold line-clamp-2 text-gray-900">{work.title}</h3>
        {work.resultSummary && (
          <p className="text-sm text-gray-500 line-clamp-2 mt-1">{work.resultSummary}</p>
        )}
        <div className="text-xs text-gray-400 mt-2 flex gap-3">
          <span>{work.viewCount} 浏览</span>
          <span>{work.likeCount} 点赞</span>
        </div>
      </div>
    </Link>
  );

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Banner */}
        <div className="relative rounded-xl overflow-hidden mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-lobster via-lobster-light to-purple-400" />
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative p-8 flex items-end gap-6">
            <div className="flex-shrink-0 -mb-4">
              {host.avatarUrl ? (
                <img
                  src={resolveMediaUrl(host.avatarUrl)}
                  alt={host.username}
                  className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-xl"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-white/90 text-lobster flex items-center justify-center text-4xl font-bold shadow-xl">
                  {host.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 pb-2">
              <h1 className="text-3xl font-bold text-white drop-shadow-sm">{host.username}</h1>
              {(host.tagline || host.bio) && (
                <p className="text-white/95 text-base mt-1 max-w-2xl">
                  {host.tagline || (host.bio && host.bio.split('\n')[0])}
                </p>
              )}
              {host.tags && host.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {host.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 rounded-full text-sm bg-white/25 text-white backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-4">
                {currentUserId !== hostId && (
                  <>
                    {isLoggedIn ? (
                      <button
                        onClick={toggleFollow}
                        disabled={isToggling}
                        className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                          following
                            ? 'bg-white/20 hover:bg-white/30 text-white border border-white/50'
                            : 'bg-white text-lobster hover:bg-white/90'
                        }`}
                      >
                        {isToggling ? '...' : following ? '已关注' : '+ 关注'}
                      </button>
                    ) : (
                      <Link
                        href="/login"
                        className="inline-block px-5 py-2 rounded-lg font-semibold text-sm bg-white text-lobster hover:bg-white/90 transition-colors"
                      >
                        登录后关注
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex flex-wrap gap-6 py-4 px-4 bg-gray-50 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats.followerCount ?? 0}</span>
            <span className="text-gray-600">{t('host.fans')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats.workCount ?? 0}</span>
            <span className="text-gray-600">{t('host.works')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats.skillCount ?? 0}</span>
            <span className="text-gray-600">{t('host.skills')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats.totalSessions ?? 0}</span>
            <span className="text-gray-600">{t('host.sessions')}</span>
          </div>
        </div>

        <div className="min-w-0">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6 overflow-x-auto">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === key
                      ? 'bg-white text-lobster shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
              <div className="space-y-10">
                {liveRooms.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-1 h-6 bg-red-500 rounded-full"></span>
                      {t('host.liveNow')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {liveRooms.map((room) => (
                        <RoomCard
                          key={room.id}
                          id={room.id}
                          title={room.title}
                          description={room.description}
                          lobsterName={room.lobsterName}
                          isLive={room.isLive}
                          viewerCount={room.viewerCount}
                          startedAt={room.startedAt}
                          host={host}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {hostWorks.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="w-1 h-6 bg-lobster rounded-full"></span>
                      {t('host.representativeWorks')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {hostWorks.slice(0, 6).map((work) => (
                        <WorkCard key={work.id} work={work} />
                      ))}
                    </div>
                  </section>
                )}
                {hostWorks.length === 0 && liveRooms.length === 0 && (
                  <div className="py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-100">
                    {t('host.noContent')}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'works' && (
              <section>
                {hostWorks.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-100">
                    {t('host.noContent')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {hostWorks.map((work) => (
                      <WorkCard key={work.id} work={work} />
                    ))}
                  </div>
                )}
              </section>
            )}

          </div>
      </div>
    </MainLayout>
  );
}
