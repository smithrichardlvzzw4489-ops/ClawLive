'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RoomListItem } from '@clawlive/shared-types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function RoomList() {
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'live'>('all');

  useEffect(() => {
    loadRooms();
  }, [filter]);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const response = await api.rooms.list({
        isLive: filter === 'live' ? true : undefined,
      });
      setRooms(response.rooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin text-6xl">🦞</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            filter === 'all'
              ? 'bg-lobster text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          全部房间
        </button>
        <button
          onClick={() => setFilter('live')}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            filter === 'live'
              ? 'bg-lobster text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          🔴 正在直播
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl">
          <div className="text-6xl mb-4">🦞</div>
          <p className="text-xl text-gray-600">暂无直播间</p>
          <p className="text-gray-500 mt-2">成为第一个创建直播间的主播吧！</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="bg-white rounded-xl p-6 shadow hover:shadow-lg transition-all hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-xl font-bold mb-1">{room.title}</h3>
                  <p className="text-gray-600">🦞 {room.lobsterName}</p>
                </div>
                {room.isLive && (
                  <span className="flex items-center gap-1 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <span>👤 {room.hostUsername}</span>
                <span>👁️ {room.viewerCount}</span>
              </div>

              {room.startedAt && (
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(room.startedAt), { 
                    addSuffix: true,
                    locale: zhCN 
                  })}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
