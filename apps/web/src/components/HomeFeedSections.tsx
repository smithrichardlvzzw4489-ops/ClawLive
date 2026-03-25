'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HomeFeedMasonry, type MasonryItem } from '@/components/HomeFeedMasonry';
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
 * 竖版优先：窄屏单列纵向滚动；随宽度增加为多列瀑布流。
 * 窄于 640px：1 列；sm～lg：3 列；lg+：5 列
 */
function useFeedGridColumnCount(): number {
  const [n, setN] = useState(1);
  useLayoutEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1024) setN(5);
      else if (w >= 640) setN(3);
      else setN(1);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return n;
}

/**
 * 首页：分区筛选 + 推荐作品与图文动态。
 * 瀑布流：最短列优先（小红书式），列间距与卡片间距约 16px（gap-4）。
 */
export function HomeFeedSections() {
  const { t } = useLocale();
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPostCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePartition, setActivePartition] = useState<string | null>(null);
  const breakpointCols = useFeedGridColumnCount();

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
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
    }
  }, []);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  const filteredWorks =
    activePartition === null
      ? recommendedWorks
      : recommendedWorks.filter((w) => w.partition === activePartition);

  const showFeedInGrid = activePartition === null;
  const hasWorks = filteredWorks.length > 0;
  const hasFeed = showFeedInGrid && feedPosts.length > 0;
  const hasAny = hasWorks || hasFeed;

  const totalItems =
    filteredWorks.length + (showFeedInGrid ? feedPosts.length : 0);
  const columnCount = totalItems > 0 ? Math.min(breakpointCols, totalItems) : 1;

  const feedItems = useMemo((): MasonryItem[] => {
    const out: MasonryItem[] = [];
    for (const work of filteredWorks) {
      out.push({
        id: `w-${work.id}`,
        node: (
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
        ),
      });
    }
    if (showFeedInGrid) {
      for (const p of feedPosts) {
        out.push({
          id: `p-${p.id}`,
          node: <FeedPostCard key={`p-${p.id}`} post={p} variant="xhs" />,
        });
      }
    }
    return out;
  }, [filteredWorks, feedPosts, showFeedInGrid]);

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
          <HomeFeedMasonry items={feedItems} columnCount={columnCount} />
        )}
      </section>
    </>
  );
}
