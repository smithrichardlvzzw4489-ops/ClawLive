'use client';

import { EvolutionPointPageClient } from './EvolutionPointPageClient';

export default function EvolutionPointPage({ params }: { params: { id: string } }) {
  return <EvolutionPointPageClient pointId={params.id} />;
}
