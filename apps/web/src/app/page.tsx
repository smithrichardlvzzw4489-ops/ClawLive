'use client';

import { MainLayout } from '@/components/MainLayout';
import { HomeFeedSections } from '@/components/HomeFeedSections';
import { HomeSidebar } from '@/components/HomeSidebar';
import { HomeSearchBar } from '@/components/HomeSearchBar';

export default function HomePage() {
  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <HomeSidebar />
        <div className="min-w-0 flex-1 bg-[#f5f5f5]">
          <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
            <HomeSearchBar />
            <HomeFeedSections />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
