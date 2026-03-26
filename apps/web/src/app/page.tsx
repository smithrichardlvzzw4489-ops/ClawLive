'use client';

import { MainLayout } from '@/components/MainLayout';
import { HomeFeedSections } from '@/components/HomeFeedSections';
import { useLocale } from '@/lib/i18n/LocaleContext';

export default function HomePage() {
  const { t } = useLocale();

  return (
    <MainLayout flatBackground>
      <div className="w-full min-h-[calc(100vh-4rem)] bg-[#f5f5f5] px-3 pb-8 pt-3 sm:px-4 lg:px-6">
        <header className="mx-auto max-w-6xl pb-6 pt-2 text-center sm:text-left">
          <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 sm:gap-x-6 sm:justify-start">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {t('home.heroTitle')}
            </h1>
            <p className="text-base leading-relaxed text-gray-600 sm:text-lg">
              {t('home.heroSubtitle')}
            </p>
          </div>
        </header>
        <HomeFeedSections />
      </div>
    </MainLayout>
  );
}
