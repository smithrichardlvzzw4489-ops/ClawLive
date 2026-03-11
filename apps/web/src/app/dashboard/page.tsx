'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Room } from '@clawlive/shared-types';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadMyRooms();
    }
  }, [isAuthenticated]);

  const loadMyRooms = async () => {
    try {
      const response = await api.rooms.list();
      setRooms(response.rooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartLive = async (roomId: string) => {
    try {
      await api.rooms.start(roomId);
      loadMyRooms();
    } catch (error) {
      console.error('Failed to start live:', error);
    }
  };

  const handleStopLive = async (roomId: string) => {
    try {
      await api.rooms.stop(roomId);
      loadMyRooms();
    } catch (error) {
      console.error('Failed to stop live:', error);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-spin">🦞</div>
          <p className="text-xl text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  const myRooms = rooms.filter((room) => room.hostId === user?.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/rooms" className="flex items-center gap-2">
            <span className="text-3xl">🦞</span>
            <span className="text-2xl font-bold text-lobster">ClawLive</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <span className="text-gray-700">👤 {user?.username}</span>
            <Link
              href="/rooms/create"
              className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              创建直播间
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">我的直播间</h1>

        {myRooms.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl">
            <div className="text-6xl mb-4">🦞</div>
            <p className="text-xl text-gray-600 mb-4">你还没有创建直播间</p>
            <Link
              href="/rooms/create"
              className="inline-block px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              创建第一个直播间
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {myRooms.map((room) => (
              <div key={room.id} className="bg-white rounded-xl p-6 shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold">{room.title}</h3>
                      {room.isLive && (
                        <span className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full">
                          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                          直播中
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 mb-2">🦞 {room.lobsterName}</p>
                    {room.description && (
                      <p className="text-gray-500 text-sm mb-3">{room.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>房间ID: {room.id}</span>
                      <span>👁️ {room.viewerCount} 观众</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      查看
                    </Link>
                    {room.isLive ? (
                      <button
                        onClick={() => handleStopLive(room.id)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        停止直播
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartLive(room.id)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        开始直播
                      </button>
                    )}
                  </div>
                </div>

                {room.dashboardUrl && (
                  <div className="mt-4 pt-4 border-t">
                    <a
                      href={room.dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-lobster hover:underline"
                    >
                      📊 Dashboard →
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
