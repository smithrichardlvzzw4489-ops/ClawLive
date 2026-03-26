'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { RoomCard } from '@/components/RoomCard';
import { useLocale } from '@/lib/i18n/LocaleContext';

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

interface MyStreamsData {
  host: {
    id: string;
    username: string;
    bio?: string;
    avatarUrl?: string;
  };
  liveRooms: Room[];
  historySessions: Room[];
  stats: {
    totalSessions: number;
    totalMessages: number;
  };
}

export default function MyStreamsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState<MyStreamsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          router.push('/login');
          return;
        }

        // Get current user
        const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!userResponse.ok) {
          router.push('/login');
          return;
        }

        const userData = await userResponse.json();
        setUser(userData);

        // Get user's streams
        const streamsResponse = await fetch(
          `${API_BASE_URL}/api/rooms/host/${userData.id}`
        );

        if (!streamsResponse.ok) {
          throw new Error('Failed to fetch streams');
        }

        const streamsData = await streamsResponse.json();
        setData(streamsData);
      } catch (err: any) {
        setError(err.message || 'Failed to load streams');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

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

  const { host, liveRooms, historySessions, stats } = data;

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* User Profile Card */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              {host.avatarUrl ? (
                <img
                  src={host.avatarUrl}
                  alt={host.username}
                  className="w-24 h-24 rounded-full object-cover border-4 border-lobster"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-lobster text-white flex items-center justify-center text-3xl font-bold">
                  {host.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('myStreams.title')}</h1>
              <p className="text-gray-600 mb-4">{host.username}</p>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalSessions}</span>
                  <span className="text-gray-600 ml-1">{t('myStreams.sessions')}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalMessages}</span>
                  <span className="text-gray-600 ml-1">{t('myStreams.messages')}</span>
                </div>
              </div>
            </div>
            <Link
              href="/rooms/create"
              className="px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              + {t('myStreams.createNew')}
            </Link>
          </div>
        </div>

        {/* Live Rooms */}
        {liveRooms.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
              {t('myStreams.liveNow')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

        {/* No live rooms prompt */}
        {liveRooms.length === 0 && (
          <section className="mb-12">
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">🎬</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('myStreams.noLive')}</h3>
              <p className="text-gray-600 mb-6">{t('myStreams.createPrompt')}</p>
              <Link
                href="/rooms/create"
                className="inline-block px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
              >
                {t('rooms.createRoom')}
              </Link>
            </div>
          </section>
        )}

        {/* History Sessions */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('myStreams.history')}</h2>
          {historySessions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
              {t('myStreams.noHistory')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {historySessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/history/${session.id}`}
                  className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2 overflow-hidden"
                >
                  <div className="relative aspect-video bg-gradient-to-br from-gray-400 to-gray-600">
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-6xl opacity-50">🦞</span>
                    </div>
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs font-semibold rounded backdrop-blur-sm">
                      {session.startedAt && session.endedAt && (
                        <>
                          {Math.round(
                            (new Date(session.endedAt).getTime() -
                              new Date(session.startedAt).getTime()) /
                              1000 /
                              60
                          )} 分钟
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900">{session.title}</h3>
                    <p className="text-sm text-gray-600 mb-3">🦞 {session.lobsterName}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t">
                      <span>💬 {session.messageCount || 0}</span>
                      {session.endedAt && (
                        <span>{new Date(session.endedAt).toLocaleDateString('zh-CN')}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
