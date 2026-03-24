'use client';

import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

function SectionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc?: string;
}) {
  return (
    <Link
      href={href}
      className="block p-6 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 hover:shadow-md transition-all"
    >
      <span className="text-3xl block mb-3">{icon}</span>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {desc && <p className="text-sm text-gray-500 mt-1">{desc}</p>}
    </Link>
  );
}

export default function HomePage() {
  const { t } = useLocale();
  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* 首屏价值主张 */}
        <section className="mb-12 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 max-w-3xl mx-auto">
            {t('home.heroTitle')}
          </h1>
          <p className="text-gray-600 text-base md:text-lg mb-8 max-w-2xl mx-auto">
            {t('home.heroSubtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/works/create"
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              {t('home.btnCreator')}
            </Link>
          </div>
        </section>

        {/* 四宫格入口 */}
        <section className="mb-12 grid grid-cols-2 md:grid-cols-3 gap-4">
          <SectionCard href="/works" icon="📚" title={t('home.fourGridWorks')} />
          <SectionCard href="/rooms" icon="📺" title={t('home.fourGridLive')} />
        </section>

      </div>
    </MainLayout>
  );
}
