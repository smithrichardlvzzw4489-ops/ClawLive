'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WorkCard } from '@/components/WorkCard';
import { FeedPostCard, type FeedPostCardItem } from '@/components/FeedPostCard';
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

/**
 * 首页同款：分区筛选 + 推荐作品 + 图文动态（供首页与创作者主页底部复用）
 */
export function HomeFeedSections() {
  const { t } = useLocale();
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPostCardItem[]>([]);
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
          setFeedPosts(data.feedPosts || []);
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
    <>
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

      <section className="mb-16">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1 h-6 bg-emerald-500 rounded-full" />
            {t('home.feedPostsSection')}
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">{t('home.feedPostsDesc')}</p>
        {!loading && feedPosts.length === 0 ? (
          <p className="text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-xl">
            {t('feedPost.emptyFeed')}
          </p>
        ) : !loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {feedPosts.map((p) => (
              <FeedPostCard key={p.id} post={p} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
