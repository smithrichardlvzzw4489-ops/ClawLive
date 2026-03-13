'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const router = useRouter();
  const hostId = params.hostId as string;
  
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '加载失败'}</p>
          <Link href="/rooms" className="text-lobster hover:underline">
            返回房间列表
          </Link>
        </div>
      </div>
    );
  }

  const { host, liveRooms, historySessions, stats } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <Link href="/rooms" className="text-lobster hover:underline mb-4 inline-block">
            ← 返回房间列表
          </Link>
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{host.username}</h1>
              {host.bio && (
                <p className="text-gray-600 mb-4">{host.bio}</p>
              )}
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalSessions}</span>
                  <span className="text-gray-600 ml-1">直播场次</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalMessages}</span>
                  <span className="text-gray-600 ml-1">总消息数</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Live Rooms */}
        {liveRooms.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
              正在直播
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveRooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-semibold text-gray-900">{room.title}</h3>
                    <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-semibold rounded">
                      直播中
                    </span>
                  </div>
                  <p className="text-gray-600 mb-3">🦞 {room.lobsterName}</p>
                  {room.description && (
                    <p className="text-gray-500 text-sm mb-3">{room.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>👁️ {room.viewerCount} 观看中</span>
                    {room.startedAt && (
                      <span>{new Date(room.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* History Sessions */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">历史直播</h2>
          {historySessions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
              暂无历史直播记录
            </div>
          ) : (
            <div className="space-y-4">
              {historySessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/history/${session.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 block"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{session.title}</h3>
                      <p className="text-gray-600 mb-3">🦞 {session.lobsterName}</p>
                      {session.description && (
                        <p className="text-gray-500 text-sm mb-3">{session.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>💬 {session.messageCount || 0} 条消息</span>
                        {session.startedAt && session.endedAt && (
                          <span>
                            ⏱️ {Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000 / 60)} 分钟
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {session.endedAt && (
                        <div>{new Date(session.endedAt).toLocaleString('zh-CN')}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
