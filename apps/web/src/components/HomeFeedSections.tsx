'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { WorkCard } from '@/components/WorkCard';
import { FeedPostCard, type FeedPostCardItem } from '@/components/FeedPostCard';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { HOME_FEED_PARTITIONS } from '@/lib/work-partitions';
import { API_BASE_URL } from '@/lib/api';

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
 * 首页：分区筛选 + 推荐作品与图文动态。
 * 大屏（lg+）：5 列 × 行高约半屏，一屏约见 2 行共 10 个卡片；继续向下滚动见更多行。
 */
export function HomeFeedSections() {
  const { t } = useLocale();
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPostCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePartition, setActivePartition] = useState<string | null>(null);

  const loadRecommendations = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/recommendations/home`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRecommendedWorks(data.recommendedWorks || []);
        setFeedPosts(data.feedPosts || []);
      }
    } catch (e) {
      console.error('Error loading recommendations:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRecommendations('initial');
  }, [loadRecommendations]);

  const filteredWorks =
    activePartition === null
      ? recommendedWorks
      : recommendedWorks.filter((w) => w.partition === activePartition);

  const showFeedInGrid = activePartition === null;
  const hasWorks = filteredWorks.length > 0;
  const hasFeed = showFeedInGrid && feedPosts.length > 0;
  const hasAny = hasWorks || hasFeed;

  return (
    <>
      <section className="mb-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActivePartition(null)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activePartition === null
                ? 'bg-gray-900 text-white'
                : 'bg-gray-200/70 text-gray-700 hover:bg-gray-300/80'
            }`}
          >
            {t('works.partitionAll')}
          </button>
          {HOME_FEED_PARTITIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePartition(p.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activePartition === p.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-200/70 text-gray-700 hover:bg-gray-300/80'
              }`}
            >
              {t(`partitions.${p.nameKey}`)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-gray-900">{t('home.worksSection')}</h2>
          <button
            type="button"
            onClick={() => void loadRecommendations('refresh')}
            disabled={refreshing || loading}
            aria-label={t('home.refreshRecommended')}
            title={t('home.refreshRecommended')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-[18px] w-[18px] ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-gray-200 border-t-lobster" />
          </div>
        ) : !hasAny ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/80 py-14 text-center">
            <p className="mb-4 text-gray-600">
              {activePartition ? t('home.noWorksInPartition') : t('home.noWorks')}
            </p>
            {!activePartition && (
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/works/create"
                  className="inline-block rounded-xl bg-lobster px-6 py-3 font-medium text-white"
                >
                  {t('works.createFirst')}
                </Link>
                <Link
                  href="/posts/create"
                  className="inline-block rounded-xl border border-lobster px-6 py-3 font-medium text-lobster hover:bg-lobster/5"
                >
                  {t('feedPost.createTitle')}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:auto-rows-[minmax(0,calc((100vh-16rem)/2))] lg:gap-3">
            {filteredWorks.map((work) => (
              <WorkCard
                key={`w-${work.id}`}
                variant="xhs"
                {...work}
                publishedAt={work.publishedAt}
                author={{
                  ...work.author,
                  avatarUrl: work.author.avatarUrl,
                }}
              />
            ))}
            {showFeedInGrid &&
              feedPosts.map((p) => <FeedPostCard key={`p-${p.id}`} post={p} variant="xhs" />)}
          </div>
        )}
      </section>
    </>
  );
}
