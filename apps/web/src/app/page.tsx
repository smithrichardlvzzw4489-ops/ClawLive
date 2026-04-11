'use client';

import { Suspense } from 'react';
import { CodernetHomeClient } from '@/components/codernet/CodernetHomeClient';

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] bg-[#06080f]" aria-hidden />}>
      <CodernetHomeClient />
    </Suspense>
  );
}
