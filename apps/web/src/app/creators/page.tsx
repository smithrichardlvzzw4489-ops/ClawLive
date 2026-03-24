'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Creator {
  id: string;
  username: string;
  avatarUrl?: string;
}

export default function CreatorsPage() {
  const { t } = useLocale();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/creators`)
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((d) => setCreators(d.creators || []))
      .catch(() => setCreators([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('creators.title')}</h1>
          <p className="text-gray-600">{t('creators.subtitle')}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
          </div>
        ) : creators.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <p className="text-gray-500">{t('creators.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {creators.map((c) => (
              <Link
                key={c.id}
                href={`/host/${c.id}`}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 hover:shadow-md transition-all"
              >
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-lobster/20 text-lobster flex items-center justify-center text-xl font-bold">
                    {c.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{c.username}</p>
                  <p className="text-sm text-gray-500">进入主页 →</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
