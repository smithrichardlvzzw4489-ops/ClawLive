'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RoomListItem } from '@clawlive/shared-types';
import { RoomCard } from './RoomCard';
import { useLocale } from '@/lib/i18n/LocaleContext';

export function RoomList() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRooms();
    
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const response = await api.rooms.list({
        isLive: true,
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
          <p className="text-xl text-gray-600">{t('rooms.noLive')}</p>
          <p className="text-gray-500 mt-2">{t('rooms.createAndStart')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              id={room.id}
              title={room.title}
              description={room.description}
              lobsterName={room.lobsterName}
              isLive={room.isLive}
              viewerCount={room.viewerCount}
              startedAt={room.startedAt}
              host={room.host}
            />
          ))}
        </div>
      )}
    </div>
  );
}

