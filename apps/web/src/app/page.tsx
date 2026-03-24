'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { WorkCard } from '@/components/WorkCard';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { WORK_PARTITIONS } from '@/lib/work-partitions';

interface Work {
  id: string;
  title: string;
  description?: string;
  resultSummary?: string;
  partition?: string;
  lobsterName: string;
  coverImage?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt: Date;
  author: { id: string; username: string; avatarUrl?: string };
}

function SectionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc?: string;
}) {
  return (
    <Link
      href={href}
      className="block p-6 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 hover:shadow-md transition-all"
    >
      <span className="text-3xl block mb-3">{icon}</span>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {desc && <p className="text-sm text-gray-500 mt-1">{desc}</p>}
    </Link>
  );
}

export default function HomePage() {
  const { t } = useLocale();
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePartition, setActivePartition] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/recommendations/home`, { headers });
        if (res.ok) {
          const data = await res.json();
          setRecommendedWorks(data.recommendedWorks || []);
        }
      } catch (e) {
        console.error('Error loading recommendations:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredWorks =
    activePartition === null
      ? recommendedWorks
      : recommendedWorks.filter((w) => w.partition === activePartition);

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* 首屏价值主张 */}
        <section className="mb-12 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 max-w-3xl mx-auto">
            {t('home.heroTitle')}
          </h1>
          <p className="text-gray-600 text-base md:text-lg mb-8 max-w-2xl mx-auto">
            {t('home.heroSubtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/works/create"
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              {t('home.btnCreator')}
            </Link>
          </div>
        </section>

        {/* 四宫格入口 */}
        <section className="mb-12 grid grid-cols-2 md:grid-cols-3 gap-4">
          <SectionCard href="/works" icon="📚" title={t('home.fourGridWorks')} />
          <SectionCard href="/rooms" icon="📺" title={t('home.fourGridLive')} />
        </section>

        {/* 分区栏 + 推荐作品 */}
        <section className="mb-10">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivePartition(null)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${activePartition === null ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {t('works.partitionAll')}
              </button>
              {WORK_PARTITIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePartition(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${activePartition === p.id ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {t(`partitions.${p.nameKey}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-6 bg-lobster rounded-full" />
              {t('home.worksSection')}
            </h2>
            <Link href="/works" className="text-lobster hover:underline text-sm">
              {t('more')} →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('home.worksDesc')}</p>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-lobster" />
            </div>
          ) : filteredWorks.length === 0 ? (
            <div className="text-center py-16 bg-white/80 rounded-2xl border-2 border-dashed border-gray-200">
              <p className="text-gray-600 mb-4">{activePartition ? t('home.noWorksInPartition') : t('home.noWorks')}</p>
              {!activePartition && (
                <Link
                  href="/works/create"
                  className="inline-block px-6 py-3 bg-lobster text-white rounded-xl font-medium"
                >
                  {t('works.createFirst')}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredWorks.map((work) => (
                <WorkCard
                  key={work.id}
                  {...work}
                  publishedAt={work.publishedAt}
                  author={{
                    ...work.author,
                    avatarUrl: work.author.avatarUrl,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
