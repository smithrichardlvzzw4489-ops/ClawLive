'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { RoomList } from '@/components/RoomList';
import { useLocale } from '@/lib/i18n/LocaleContext';

export default function RoomsPage() {
  const { t } = useLocale();
  const [user, setUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUser(data))
      .catch(() => {});
  }, []);

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('rooms.title')}</h1>
            <p className="text-gray-600">{t('rooms.subtitle')}</p>
          </div>
          <Link
            href={user ? '/rooms/create' : '/login?redirect=/rooms/create'}
            className="px-5 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors flex items-center gap-2 flex-shrink-0"
          >
            <span>📹</span>
            <span>{t('rooms.createRoom')}</span>
          </Link>
        </div>

        <RoomList />
      </div>
    </MainLayout>
  );
}

