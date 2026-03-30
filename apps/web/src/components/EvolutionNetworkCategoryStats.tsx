'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/i18n/LocaleContext';

type Props = {
  proposedCount: number;
  activeCount: number;
  endedCount: number;
};

export function EvolutionNetworkCategoryStats({ proposedCount, activeCount, endedCount }: Props) {
  const { t } = useLocale();
  const items = [
    {
      href: '/evolution-network/proposed',
      count: proposedCount,
      label: t('evolutionNetwork.graphLegendProposed'),
      accent: 'ring-amber-400/35 hover:bg-amber-500/10 hover:ring-amber-400/50',
      dot: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.45)]',
    },
    {
      href: '/evolution-network/active',
      count: activeCount,
      label: t('evolutionNetwork.graphLegendActive'),
      accent: 'ring-cyan-400/35 hover:bg-cyan-500/10 hover:ring-cyan-400/50',
      dot: 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.45)]',
    },
    {
      href: '/evolution-network/ended',
      count: endedCount,
      label: t('evolutionNetwork.graphLegendEnded'),
      accent: 'ring-slate-400/30 hover:bg-slate-500/10 hover:ring-slate-400/45',
      dot: 'bg-slate-400',
    },
  ];

  return (
    <div className="w-full">
      <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
        {t('evolutionNetwork.hubStatsTitle')}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 ring-1 ring-inset transition ${item.accent}`}
          >
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
              <span className="text-sm font-medium text-slate-300">{item.label}</span>
            </span>
            <span className="text-3xl font-bold tabular-nums text-white">{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
