'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { WORK_PARTITIONS } from '@/lib/work-partitions';

interface SkillListItem {
  id: string;
  title: string;
  description?: string;
  partition: string;
  sourceWorkId?: string;
  tags: string[];
  viewCount: number;
  useCount: number;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export default function MarketPage() {
  const { t } = useLocale();
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePartition, setActivePartition] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadSkills();
  }, [activePartition, search]);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activePartition) params.set('partition', activePartition);
      if (search.trim()) params.set('search', search.trim());
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/skills${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <section className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('market.title')}</h1>
          <p className="text-gray-600">{t('market.subtitle')}</p>
        </section>

        <section className="mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActivePartition(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activePartition === null ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('works.partitionAll')}
                </button>
                {WORK_PARTITIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePartition(p.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activePartition === p.id ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t(`partitions.${p.nameKey}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <div className="text-6xl mb-4">📦</div>
            <p className="text-gray-600">{t('market.empty')}</p>
            <Link
              href="/works/create"
              className="inline-block mt-4 px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark"
            >
              {t('nav.createWork')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <Link
                key={skill.id}
                href={`/market/${skill.id}`}
                className="block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-lobster/30 transition-all"
              >
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{skill.title}</h3>
                {skill.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{skill.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span>{skill.author.username}</span>
                  <span>{t(`partitions.${WORK_PARTITIONS.find((p) => p.id === skill.partition)?.nameKey || 'other'}`)}</span>
                </div>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{skill.viewCount} {t('market.views')}</span>
                  <span>{skill.useCount} {t('market.uses')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
