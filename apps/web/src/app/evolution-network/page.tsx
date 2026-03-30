'use client';

import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { EvolutionNetworkCategoryStats } from '@/components/EvolutionNetworkCategoryStats';
import { EvolutionNetworkGraph } from '@/components/EvolutionNetworkGraph';
import { EVOLUTION_NETWORK_MOCK, filterByStatus } from '@/lib/evolution-network';
import { useLocale } from '@/lib/i18n/LocaleContext';

export default function EvolutionNetworkPage() {
  const { t } = useLocale();
  const router = useRouter();
  const all = EVOLUTION_NETWORK_MOCK;
  const proposed = filterByStatus(all, 'proposed');
  const active = filterByStatus(all, 'active');
  const ended = filterByStatus(all, 'ended');

  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-12 pt-4 sm:px-4 lg:px-6">
        <header className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('evolutionNetwork.title')}
          </h1>
        </header>

        <div className="mx-auto mt-8 max-w-6xl">
          <EvolutionNetworkGraph
            points={all}
            onNodeClick={(p) => router.push(`/evolution-network/point/${p.id}`)}
            labels={{
              center: t('evolutionNetwork.graphCenter'),
              proposed: t('evolutionNetwork.graphLegendProposed'),
              active: t('evolutionNetwork.graphLegendActive'),
              ended: t('evolutionNetwork.graphLegendEnded'),
              nodeCount: t('evolutionNetwork.graphNodeCount', { count: String(all.length) }),
              empty: t('evolutionNetwork.graphEmpty'),
              graphClickHint: t('evolutionNetwork.graphClickHint'),
            }}
          />
        </div>

        <div className="mx-auto mt-8 max-w-6xl">
          <EvolutionNetworkCategoryStats
            proposedCount={proposed.length}
            activeCount={active.length}
            endedCount={ended.length}
          />
        </div>
      </div>
    </MainLayout>
  );
}
