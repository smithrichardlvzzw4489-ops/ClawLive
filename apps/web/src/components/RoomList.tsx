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

  useEffect(() => {
    loadRooms();
    
    // Auto-refresh every 5 seconds to update live status
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const response = await api.rooms.list({
        isLive: true, // Only show live rooms
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
      {rooms.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl">
          <div className="text-6xl mb-4">🦞</div>
          <p className="text-xl text-gray-600">暂无正在直播的房间</p>
          <p className="text-gray-500 mt-2">创建直播间并开始直播吧！</p>
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
                  {room.description && (
                    <p className="text-sm text-gray-500 mt-1">{room.description}</p>
                  )}
                </div>
                {room.isLive && (
                  <span className="flex items-center gap-1 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <Link
                  href={`/host/${room.host.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 hover:text-lobster"
                >
                  {room.host.avatarUrl ? (
                    <img src={room.host.avatarUrl} alt={room.host.username} className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-lobster text-white flex items-center justify-center text-xs">
                      {room.host.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span>{room.host.username}</span>
                </Link>
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
