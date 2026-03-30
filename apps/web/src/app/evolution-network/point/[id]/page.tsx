import { notFound } from 'next/navigation';
import { EvolutionPointPageClient } from './EvolutionPointPageClient';
import { getEvolutionPointById } from '@/lib/evolution-network';

export default function EvolutionPointPage({ params }: { params: { id: string } }) {
  const point = getEvolutionPointById(params.id);
  if (!point) notFound();

  return <EvolutionPointPageClient point={point} />;
}
