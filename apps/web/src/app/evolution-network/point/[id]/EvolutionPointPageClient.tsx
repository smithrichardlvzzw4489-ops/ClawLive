'use client';

import { MainLayout } from '@/components/MainLayout';
import { EvolutionPointDetailView } from '@/components/EvolutionPointDetailView';
import { EvolutionPointWorksFeed } from '@/components/EvolutionPointWorksFeed';
import type { EvolutionPoint } from '@/lib/evolution-network';

export function EvolutionPointPageClient({ point }: { point: EvolutionPoint }) {
  if (point.status === 'proposed') {
    return (
      <MainLayout>
        <div className="mx-auto max-w-md px-3 py-6 sm:px-4 lg:px-6">
          <EvolutionPointDetailView point={point} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <EvolutionPointWorksFeed point={point} />
    </MainLayout>
  );
}
