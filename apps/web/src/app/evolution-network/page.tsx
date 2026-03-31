'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { EvolutionNetworkCategoryStats } from '@/components/EvolutionNetworkCategoryStats';
import { EvolutionNetworkGraph } from '@/components/EvolutionNetworkGraph';
import { api } from '@/lib/api';
import {
  evolutionNetworkHotspots,
  filterByStatus,
  type EvolutionPoint,
} from '@/lib/evolution-network';
import { useLocale } from '@/lib/i18n/LocaleContext';

export default function EvolutionNetworkPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [all, setAll] = useState<EvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = (await api.evolutionNetwork.listPoints()) as { points: EvolutionPoint[] };
        if (!cancelled) setAll(r.points ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
          setAll([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const graphPoints = evolutionNetworkHotspots(all, 8);
  const proposed = filterByStatus(all, 'proposed');
  const active = filterByStatus(all, 'active');
  const ended = filterByStatus(all, 'ended');
  const evolvingCount = proposed.length + active.length;

  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-12 pt-4 sm:px-4 lg:px-6">
        {error && (
          <div className="mx-auto max-w-6xl pt-4 text-center text-sm text-red-400/90">{error}</div>
        )}
        {loading && (
          <div className="mx-auto max-w-md px-3 py-16 text-center text-sm text-slate-500">加载中…</div>
        )}
        {!loading && (
          <>
            <div className="mx-auto flex max-w-6xl justify-end px-1 pt-2">
              <Link
                href="/evolution-network/observation"
                className="text-sm font-medium text-cyber/90 transition hover:text-cyber hover:underline"
              >
                {t('evolutionNetwork.observationTitle')} →
              </Link>
            </div>
            <div className="mx-auto mt-4 max-w-6xl sm:mt-6">
              <EvolutionNetworkGraph
                points={graphPoints}
                onNodeClick={(p) => router.push(`/evolution-network/point/${p.id}`)}
                labels={{
                  evolving: t('evolutionNetwork.graphLegendActive'),
                  ended: t('evolutionNetwork.graphLegendEnded'),
                  empty: t('evolutionNetwork.graphEmpty'),
                }}
              />
            </div>

            <div className="mx-auto mt-8 max-w-6xl">
              <EvolutionNetworkCategoryStats evolvingCount={evolvingCount} endedCount={ended.length} />
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
