'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { RoomCard } from '@/components/RoomCard';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Host {
  id: string;
  username: string;
  bio?: string;
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

interface HostData {
  host: Host;
  liveRooms: Room[];
  historySessions: Room[];
  stats: {
    totalSessions: number;
    totalMessages: number;
  };
}

export default function HostPage() {
  const params = useParams();
  const hostId = params.hostId as string;
  
  const { t } = useLocale();
  const [data, setData] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHostData = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/host/${hostId}`);
        
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
        {/* Host Profile Banner */}
        <div className="bg-gradient-to-r from-lobster-light to-purple-200 rounded-xl p-8 mb-8">
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              {host.avatarUrl ? (
                <img
                  src={host.avatarUrl}
                  alt={host.username}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-white text-lobster flex items-center justify-center text-4xl font-bold shadow-lg">
                  {host.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 text-white">
              <h1 className="text-4xl font-bold mb-3">{host.username}</h1>
              {host.bio && (
                <p className="text-lg opacity-90 mb-4">{host.bio}</p>
              )}
              <div className="flex gap-8 text-sm">
                <div>
                  <span className="font-bold text-2xl">{stats.totalSessions}</span>
                  <span className="ml-2 opacity-90">直播</span>
                </div>
                <div>
                  <span className="font-bold text-2xl">{stats.totalMessages}</span>
                  <span className="ml-2 opacity-90">消息</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Rooms */}
        {liveRooms.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="w-1 h-8 bg-red-500 rounded-full"></span>
              <span>{t('host.liveNow')}</span>
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

        {/* History Sessions */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-1 h-8 bg-lobster rounded-full"></span>
            <span>{t('host.history')}</span>
          </h2>
          {historySessions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500">
              {t('host.noHistory')}
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
