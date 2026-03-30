import { notFound } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { EvolutionPointDetailView } from '@/components/EvolutionPointDetailView';
import { getEvolutionPointById } from '@/lib/evolution-network';

export default function EvolutionPointPage({ params }: { params: { id: string } }) {
  const point = getEvolutionPointById(params.id);
  if (!point) notFound();

  return (
    <MainLayout>
      <div className="mx-auto max-w-md px-3 py-6 sm:px-4 lg:px-6">
        <EvolutionPointDetailView point={point} />
      </div>
    </MainLayout>
  );
}
