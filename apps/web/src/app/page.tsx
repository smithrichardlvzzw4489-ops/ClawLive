'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { WorkCard } from '@/components/WorkCard';
import { RoomCard } from '@/components/RoomCard';
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
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

interface LiveRoom {
  id: string;
  title: string;
  lobsterName: string;
  description?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt?: Date;
  host: { id: string; username: string; avatarUrl?: string | null };
}

interface Skill {
  id: string;
  title: string;
  description?: string;
  partition: string;
  sourceType: string;
  tags: string[];
  viewCount: number;
  useCount: number;
  author: { id: string; username: string; avatarUrl?: string | null };
}

export default function HomePage() {
  const { t } = useLocale();
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [recommendedSkills, setRecommendedSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePartition, setActivePartition] = useState<string | null>(null);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/recommendations/home`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRecommendedWorks(data.recommendedWorks || []);
        setLiveRooms(data.liveRooms || []);
        setRecommendedSkills(data.recommendedSkills || []);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWorks =
    activePartition === null
      ? recommendedWorks
      : recommendedWorks.filter((w) => w.partition === activePartition);

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* 分区栏 - B站风格 */}
        <section className="mb-10">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActivePartition(null)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activePartition === null
                    ? 'bg-[#f06261] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('works.partitionAll')}
              </button>
              {WORK_PARTITIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePartition(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activePartition === p.id
                      ? 'bg-[#f06261] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t(`partitions.${p.nameKey}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Live Rooms Section */}
        {liveRooms.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-1 h-8 bg-red-500 rounded-full"></span>
                <span>{t('home.liveSection')}</span>
              </h2>
              <Link
                href="/rooms"
                className="text-lobster hover:text-lobster-dark font-medium flex items-center gap-1 transition-colors"
              >
                <span>{t('more')}</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {liveRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  {...room}
                  host={{ ...room.host, avatarUrl: room.host.avatarUrl ?? undefined }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recommended Works Section */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-8 bg-lobster rounded-full"></span>
              <span>{t('home.worksSection')}</span>
            </h2>
            <Link
              href="/my-works"
              className="text-lobster hover:text-lobster-dark font-medium flex items-center gap-1 transition-colors"
            >
              <span>{t('more')}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin text-6xl">🦞</div>
            </div>
          ) : filteredWorks.length === 0 ? (
            <div className="text-center py-16 px-6 bg-white/80 rounded-2xl border-2 border-dashed border-gray-200 animate-fade-in">
              <span className="text-6xl block mb-4">🖼️</span>
              <p className="text-gray-600 text-lg mb-2">
                {activePartition ? t('home.noWorksInPartition') : t('home.noWorks')}
              </p>
              <p className="text-gray-500 text-sm mb-6">
                {activePartition ? t('home.tryOtherPartition') : t('home.createWorkPrompt')}
              </p>
              {!activePartition && (
                <Link
                  href="/works/create"
                  className="inline-block px-6 py-3 bg-lobster text-white rounded-xl font-medium hover:bg-lobster-dark transition-colors"
                >
                  {t('works.createFirst')}
                </Link>
              )}
              {activePartition && (
                <button
                  onClick={() => setActivePartition(null)}
                  className="inline-block px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                >
                  {t('works.partitionAll')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredWorks.map((work, i) => (
                <div key={work.id} className="animate-slide-up" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
                  <WorkCard {...work} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recommended Skills Section */}
        {!loading && recommendedSkills.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-1 h-8 bg-lobster rounded-full"></span>
                <span>{t('home.skillsSection')}</span>
              </h2>
              <Link
                href="/market"
                className="text-lobster hover:text-lobster-dark font-medium flex items-center gap-1 transition-colors"
              >
                <span>{t('more')}</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendedSkills.map((skill) => (
                <Link
                  key={skill.id}
                  href={`/market/${skill.id}`}
                  className="block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-lobster/30 transition-all"
                >
                  <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">{skill.title}</h3>
                  {skill.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{skill.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {skill.sourceType === 'official' && (
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-lobster/15 text-lobster rounded">官方</span>
                    )}
                    {skill.tags?.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{tag}</span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400">
                    {skill.author.username} · {skill.viewCount} 浏览 · {skill.useCount} 使用
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </MainLayout>
  );
}

