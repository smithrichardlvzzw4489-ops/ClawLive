'use client';

import { MainLayout } from '@/components/MainLayout';
import { HomeFeedSections } from '@/components/HomeFeedSections';

export default function LabPage() {
  return (
    <MainLayout>
      <div className="w-full min-h-[calc(100vh-5rem)] px-3 pb-8 pt-3 sm:px-4 lg:px-6">
        <HomeFeedSections />
      </div>
    </MainLayout>
  );
}
