'use client';

import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { EvolutionPointDetailView } from '@/components/EvolutionPointDetailView';
import { EvolutionPointWorksFeed } from '@/components/EvolutionPointWorksFeed';
import { api } from '@/lib/api';
import type { EvolutionComment, EvolutionPoint } from '@/lib/evolution-network';

export function EvolutionPointPageClient({ pointId }: { pointId: string }) {
  const [point, setPoint] = useState<EvolutionPoint | null>(null);
  const [comments, setComments] = useState<EvolutionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pr, cr] = await Promise.all([
        api.evolutionNetwork.getPoint(pointId) as Promise<{ point: EvolutionPoint }>,
        api.evolutionNetwork.getComments(pointId) as Promise<{ comments: EvolutionComment[] }>,
      ]);
      setPoint(pr.point);
      setComments(cr.comments ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
      setPoint(null);
    } finally {
      setLoading(false);
    }
  }, [pointId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-md px-3 py-16 text-center text-sm text-slate-500">加载中…</div>
      </MainLayout>
    );
  }

  if (error || !point) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-md px-3 py-16 text-center text-sm text-slate-400">
          {error ?? '进化点不存在'}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[min(100%,1600px)] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-2xl">
          <EvolutionPointDetailView point={point} comments={comments} onRefresh={load} />
        </div>
        <EvolutionPointWorksFeed point={point} variant="feedOnly" />
      </div>
    </MainLayout>
  );
}
