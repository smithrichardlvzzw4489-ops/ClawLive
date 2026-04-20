'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { CodernetLinkSearchPanel } from '@/components/codernet/CodernetLinkSearchPanel';
import { usePrimaryPersona } from '@/contexts/PrimaryPersonaContext';
import { useLocale } from '@/lib/i18n/LocaleContext';

function CodernetLinkPageInner() {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const router = useRouter();
  const { persona, personaReady } = usePrimaryPersona();
  const { t } = useLocale();
  const returnTo = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    [pathname, searchParams],
  );

  useEffect(() => {
    if (!personaReady) return;
    if (persona === 'developer') router.replace('/job-plaza');
    else if (persona === 'unset') router.replace('/');
  }, [personaReady, persona, router]);

  if (!personaReady || persona !== 'recruiter') {
    return (
      <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-slate-500">
        {t('loading')}
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/15 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/10 blur-[160px]" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8">
        <CodernetLinkSearchPanel returnTo={returnTo} />
      </div>
    </>
  );
}

export default function CodernetLinkPage() {
  return (
    <MainLayout flatBackground>
      <div className="relative min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white">
        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center text-slate-500 text-sm">加载中…</div>
          }
        >
          <CodernetLinkPageInner />
        </Suspense>
      </div>
    </MainLayout>
  );
}
