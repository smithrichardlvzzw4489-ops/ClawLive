'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { WorkCard } from '@/components/WorkCard';
import { RoomCard } from '@/components/RoomCard';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface SearchResult {
  rooms: Array<{
    id: string;
    title: string;
    lobsterName: string;
    description?: string;
    viewerCount: number;
    isLive: boolean;
    startedAt?: Date;
    host: { id: string; username: string; avatarUrl?: string | null };
  }>;
  works: Array<{
    id: string;
    title: string;
    description?: string;
    resultSummary?: string;
    lobsterName: string;
    coverImage?: string;
    videoUrl?: string;
    tags: string[];
    viewCount: number;
    likeCount: number;
    messageCount: number;
    publishedAt?: Date;
    author: { id: string; username: string; avatarUrl?: string | null };
  }>;
  hosts: Array<{ id: string; username: string; avatarUrl?: string | null }>;
}

type TabType = 'live' | 'works' | 'hosts';

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const { t } = useLocale();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('live');

  useEffect(() => {
    if (!q.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => {
        setResult({
          rooms: data.rooms || [],
          works: data.works || [],
          hosts: data.hosts || [],
        });
      })
      .catch(() => setResult({ rooms: [], works: [], hosts: [] }))
      .finally(() => setLoading(false));
  }, [q]);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'live', label: t('search.tabLive'), count: result?.rooms?.length ?? 0 },
    { key: 'works', label: t('search.tabWorks'), count: result?.works?.length ?? 0 },
    { key: 'hosts', label: t('search.tabHosts'), count: result?.hosts?.length ?? 0 },
  ];

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('search.title')}</h1>
        {!q ? (
          <p className="text-gray-500">{t('search.empty')}</p>
        ) : (
          <p className="text-gray-600">
            「{q}」 — {(result?.rooms?.length ?? 0) + (result?.works?.length ?? 0) + (result?.hosts?.length ?? 0)} {t('search.resultsCount')}
          </p>
        )}
      </div>

      {!q ? null : loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab.key ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {activeTab === 'live' && (
            <section>
              {!result?.rooms?.length ? (
                <p className="text-gray-500 py-8 text-center">{t('search.noResults')}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {result.rooms.map((room) => (
                    <RoomCard key={room.id} {...room} />
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'works' && (
            <section>
              {!result?.works?.length ? (
                <p className="text-gray-500 py-8 text-center">{t('search.noResults')}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {result.works.map((work) => (
                    <WorkCard key={work.id} {...work} publishedAt={work.publishedAt} />
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'hosts' && (
            <section>
              {!result?.hosts?.length ? (
                <p className="text-gray-500 py-8 text-center">{t('search.noResults')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {result.hosts.map((host) => (
                    <Link
                      key={host.id}
                      href={`/host/${host.id}`}
                      className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
                    >
                      {host.avatarUrl ? (
                        <img src={host.avatarUrl} alt={host.username} className="w-14 h-14 rounded-full object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-lobster text-white flex items-center justify-center text-xl font-bold">
                          {host.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{host.username}</p>
                        <p className="text-sm text-gray-500">UP主</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="container mx-auto px-6 py-8">加载中...</div>}>
        <SearchContent />
      </Suspense>
    </MainLayout>
  );
}
