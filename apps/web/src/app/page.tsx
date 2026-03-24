'use client';

import { MainLayout } from '@/components/MainLayout';
import { HomeFeedSections } from '@/components/HomeFeedSections';

export default function HomePage() {
  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <HomeFeedSections />
      </div>
    </MainLayout>
  );
}
