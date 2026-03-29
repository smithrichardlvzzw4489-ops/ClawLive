'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { HomeFeedMasonry, type MasonryItem } from '@/components/HomeFeedMasonry';
import { WorkCard } from '@/components/WorkCard';
import { FeedPostCard, type FeedPostCardItem } from '@/components/FeedPostCard';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { HOME_FEED_PARTITIONS } from '@/lib/work-partitions';
import { API_BASE_URL } from '@/lib/api';

const LOAD_MORE_SIZE = 12;

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
  const [extraWorks, setExtraWorks] = useState<Work[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPostCardItem[]>([]);
  const [extraFeedPosts, setExtraFeedPosts] = useState<FeedPostCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activePartition, setActivePartition] = useState<string | null>(null);
  const breakpointCols = useFeedGridColumnCount();

  // 去重用：已展示的 id 集合
  const shownWorkIdsRef = useRef<Set<string>>(new Set());
  const shownFeedPostIdsRef = useRef<Set<string>>(new Set());
  // 各自的分页 offset
  const worksApiOffsetRef = useRef(0);
  const feedPostsApiOffsetRef = useRef(0);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    shownWorkIdsRef.current = new Set();
    shownFeedPostIdsRef.current = new Set();
    worksApiOffsetRef.current = 0;
    feedPostsApiOffsetRef.current = 0;
    setExtraWorks([]);
    setExtraFeedPosts([]);
    setHasMore(false);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/recommendations/home`, { headers });
      if (res.ok) {
        const data = await res.json();
        const recs: Work[] = data.recommendedWorks || [];
        const fps: FeedPostCardItem[] = data.feedPosts || [];
        const totalWorks: number = data.totalWorks ?? recs.length;
        const totalFeedPosts: number = data.totalFeedPosts ?? fps.length;
        setRecommendedWorks(recs);
        setFeedPosts(fps);
        recs.forEach((w) => shownWorkIdsRef.current.add(w.id));
        fps.forEach((p) => shownFeedPostIdsRef.current.add(p.id));
        // 系统总内容数 > 当前已展示数，才显示"加载更多"
        const totalSystem = totalWorks + totalFeedPosts;
        const totalShown = recs.length + fps.length;
        setHasMore(totalShown < totalSystem);
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

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const worksOffset = worksApiOffsetRef.current;
      const feedOffset = feedPostsApiOffsetRef.current;

      const [worksRes, feedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/works?offset=${worksOffset}&limit=${LOAD_MORE_SIZE}`),
        fetch(`${API_BASE_URL}/api/feed-posts?offset=${feedOffset}&limit=${LOAD_MORE_SIZE}`),
      ]);

      let moreWorks = false;
      let moreFeed = false;

      if (worksRes.ok) {
        const data = (await worksRes.json()) as { works: Work[]; total: number };
        const newWorks = (data.works || []).filter((w) => !shownWorkIdsRef.current.has(w.id));
        newWorks.forEach((w) => shownWorkIdsRef.current.add(w.id));
        setExtraWorks((prev) => [...prev, ...newWorks]);
        const nextOffset = worksOffset + LOAD_MORE_SIZE;
        worksApiOffsetRef.current = nextOffset;
        moreWorks = nextOffset < data.total;
      }

      if (feedRes.ok) {
        const data = (await feedRes.json()) as { posts: FeedPostCardItem[]; total: number };
        const newPosts = (data.posts || []).filter((p) => !shownFeedPostIdsRef.current.has(p.id));
        newPosts.forEach((p) => shownFeedPostIdsRef.current.add(p.id));
        setExtraFeedPosts((prev) => [...prev, ...newPosts]);
        const nextOffset = feedOffset + LOAD_MORE_SIZE;
        feedPostsApiOffsetRef.current = nextOffset;
        moreFeed = nextOffset < data.total;
      }

      setHasMore(moreWorks || moreFeed);
    } catch (e) {
      console.error('Error loading more:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

  const allWorks = useMemo(
    () => [...recommendedWorks, ...extraWorks],
    [recommendedWorks, extraWorks],
  );

  const allFeedPosts = useMemo(
    () => [...feedPosts, ...extraFeedPosts],
    [feedPosts, extraFeedPosts],
  );

  const filteredWorks =
    activePartition === null
      ? allWorks
      : allWorks.filter((w) => w.partition === activePartition);

  const showFeedInGrid = activePartition === null;
  const hasWorks = filteredWorks.length > 0;
  const hasFeed = showFeedInGrid && allFeedPosts.length > 0;
  const hasAny = hasWorks || hasFeed;

  const totalItems =
    filteredWorks.length + (showFeedInGrid ? allFeedPosts.length : 0);
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
      for (const p of allFeedPosts) {
        out.push({
          id: `p-${p.id}`,
          node: <FeedPostCard key={`p-${p.id}`} post={p} variant="xhs" />,
        });
      }
    }
    return out;
  }, [filteredWorks, allFeedPosts, showFeedInGrid]);

  return (
    <>
      <section className="mb-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActivePartition(null)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              activePartition === null
                ? 'bg-lobster/90 text-white glow-lobster-sm'
                : 'bg-white/[0.06] text-slate-400 ring-1 ring-white/10 hover:bg-white/[0.10] hover:text-slate-200'
            }`}
          >
            {t('works.partitionAll')}
          </button>
          {HOME_FEED_PARTITIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePartition(p.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                activePartition === p.id
                  ? 'bg-lobster/90 text-white glow-lobster-sm'
                  : 'bg-white/[0.06] text-slate-400 ring-1 ring-white/10 hover:bg-white/[0.10] hover:text-slate-200'
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
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-lobster" />
          </div>
        ) : !hasAny ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <p className="mb-4 text-slate-500">
              {activePartition ? t('home.noWorksInPartition') : t('home.noWorks')}
            </p>
            {!activePartition && (
              <div className="flex flex-wrap justify-center gap-3">
                {/* [FEATURE:CO_CREATE] 与龙虾共创入口（首页空状态按钮）— 已隐藏，恢复时删除此注释块 START
                <Link
                  href="/works/create"
                  className="inline-block rounded-xl bg-lobster px-6 py-3 font-medium text-white"
                >
                  {t('works.createFirst')}
                </Link>
                [FEATURE:CO_CREATE] END */}
                <Link
                  href="/posts/create"
                  className="inline-block rounded-xl border border-lobster/50 px-6 py-3 font-medium text-lobster hover:bg-lobster/10 transition-all"
                >
                  {t('feedPost.createTitle')}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <HomeFeedMasonry items={feedItems} columnCount={columnCount} />
            {hasMore && (
              <div className="mt-8 flex justify-center pb-4">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-8 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/[0.08] hover:text-slate-200 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-lobster" />
                      加载中...
                    </>
                  ) : (
                    '加载更多'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
