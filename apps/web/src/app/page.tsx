'use client';

import { MainLayout } from '@/components/MainLayout';
import { HomeFeedSections } from '@/components/HomeFeedSections';
import { HomeSidebar } from '@/components/HomeSidebar';
import { HomeSearchBar } from '@/components/HomeSearchBar';

export default function HomePage() {
  return (
    <MainLayout flatBackground>
      <div className="flex min-h-[calc(100vh-4rem)] w-full bg-[#f5f5f5]">
        <HomeSidebar />
        <div className="min-w-0 flex-1 w-full min-h-0 flex flex-col bg-[#f5f5f5]">
          {/* 搜索固定在顶栏下方，与主区同色 */}
          <div className="sticky top-16 z-30 w-full border-b border-gray-200/40 bg-[#f5f5f5] px-3 py-3 sm:px-4 lg:px-5">
            <HomeSearchBar className="max-w-3xl mx-auto" />
          </div>
          <div className="w-full flex-1 px-3 pb-6 pt-2 sm:px-4 lg:px-5">
            <HomeFeedSections />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
