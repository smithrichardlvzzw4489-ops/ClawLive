'use client';

import { Suspense } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { MarketContent } from './MarketContent';

export default function MarketPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="container mx-auto px-6 py-12 flex justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-lobster" /></div>}>
        <MarketContent />
      </Suspense>
    </MainLayout>
  );
}
