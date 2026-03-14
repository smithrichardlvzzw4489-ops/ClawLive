'use client';

import { MainLayout } from '@/components/MainLayout';
import { RoomList } from '@/components/RoomList';
import { useLocale } from '@/lib/i18n/LocaleContext';

export default function RoomsPage() {
  const { t } = useLocale();
  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('rooms.title')}</h1>
          <p className="text-gray-600">{t('rooms.subtitle')}</p>
        </div>

        <RoomList />
      </div>
    </MainLayout>
  );
}

