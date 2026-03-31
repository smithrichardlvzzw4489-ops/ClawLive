'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { HomeFeedMasonry, type MasonryItem } from '@/components/HomeFeedMasonry';
import { FeedPostCard, type FeedPostCardItem } from '@/components/FeedPostCard';
import { useFeedGridColumnCount } from '@/hooks/useFeedGridColumnCount';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { EvolutionPoint } from '@/lib/evolution-network';

function categoryPath(point: EvolutionPoint): string {
  if (point.status === 'ended') return '/evolution-network/ended';
  return '/evolution-network/active';
}

type Props = {
  point: EvolutionPoint;
  /** full：独立页顶栏；feedOnly：接在详情下方，仅作品区 */
  variant?: 'full' | 'feedOnly';
};

/**
 * 进化中 / 已结束：详情页按实验室首页同款瀑布流呈现该点下的作品（图文）。
 */
export function EvolutionPointWorksFeed({ point, variant = 'full' }: Props) {
  const { t } = useLocale();
  const columnCount = useFeedGridColumnCount();
  const [posts, setPosts] = useState<FeedPostCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = (await api.feedPosts.list({
          evolutionPointId: point.id,
          limit: 100,
        })) as { posts: FeedPostCardItem[] };
        if (!cancelled) setPosts(r.posts ?? []);
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [point.id]);

  const feedItems = useMemo((): MasonryItem[] => {
    return posts.map((p) => ({
      id: p.id,
      node: <FeedPostCard key={p.id} post={p} variant="xhs" />,
    }));
  }, [posts]);

  const feedOnly = variant === 'feedOnly';

  return (
    <div
      className={
        feedOnly
          ? 'mt-10 border-t border-white/10 pt-8'
          : 'w-full min-h-[calc(100vh-5rem)] bg-[#0a0a0a] bg-[radial-gradient(rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:14px_14px] px-3 pb-12 pt-4 sm:px-4 lg:px-6'
      }
    >
      <div className="mx-auto w-full max-w-[min(100%,1600px)]">
        {!feedOnly && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <Link href="/evolution-network" className="text-slate-400 transition hover:text-white">
                ← {t('evolutionNetwork.backToHub')}
              </Link>
              <Link
                href={categoryPath(point)}
                className="text-slate-500 transition hover:text-slate-300"
              >
                {t('evolutionNetwork.backToCategory')}
              </Link>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{point.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{point.goal}</p>
            <p className="mt-2 text-xs text-slate-500">{t('evolutionNetwork.pointWorksBlurb')}</p>
          </>
        )}

        {feedOnly && (
          <h2 className="text-lg font-semibold tracking-tight text-white">{t('evolutionNetwork.pointWorksSection')}</h2>
        )}

        <section className="mb-4 mt-6">
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              className="shrink-0 rounded-full bg-lobster/90 px-4 py-2 text-sm font-medium text-white glow-lobster-sm"
            >
              {t('works.partitionAll')}
            </button>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <p className="text-slate-500">加载中…</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <p className="text-slate-500">{t('evolutionNetwork.pointWorksEmpty')}</p>
          </div>
        ) : (
          <HomeFeedMasonry items={feedItems} columnCount={columnCount} />
        )}
      </div>
    </div>
  );
}
