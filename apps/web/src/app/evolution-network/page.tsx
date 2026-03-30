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
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-base">
            {t('evolutionNetwork.subtitle')}
          </p>
          <p className="mt-3 max-w-3xl text-sm text-slate-500">{t('evolutionNetwork.hubMainBlurb')}</p>
          <div className="mt-4 max-w-3xl rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-200">{t('evolutionNetwork.howToJoinTitle')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t('evolutionNetwork.howToJoinBody')}</p>
          </div>
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

        <div className="mx-auto mt-6 max-w-6xl rounded-xl border border-white/[0.06] bg-violet-950/20 px-4 py-3 text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">{t('evolutionNetwork.rulesTitle')}：</span>
          {t('evolutionNetwork.rulesShort')}
        </div>
      </div>
    </MainLayout>
  );
}
