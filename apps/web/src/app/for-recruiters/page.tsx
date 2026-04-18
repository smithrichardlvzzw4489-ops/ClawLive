'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { usePrimaryPersona } from '@/hooks/usePrimaryPersona';

export default function ForRecruitersPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { setPersona } = usePrimaryPersona();

  const go = (path: string) => {
    setPersona('recruiter');
    router.push(path);
  };

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-xl px-4 py-12 text-slate-200">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-violet-300/90">GITLINK</p>
        <h1 className="mb-4 text-2xl font-bold text-white sm:text-3xl">{t('personaEntry.recruitersTitle')}</h1>
        <p className="mb-3 text-slate-300">{t('personaEntry.recruitersLead')}</p>
        <p className="mb-8 text-sm leading-relaxed text-slate-400">{t('personaEntry.recruitersBody')}</p>
        <p className="mb-6 text-xs text-slate-500">{t('personaEntry.noteStoredLocally')}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => go('/recruitment')}
            className="rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500"
          >
            {t('personaEntry.ctaRecruiters')} · {t('personaEntry.enterRecruitment')}
          </button>
          <button
            type="button"
            onClick={() => go('/job-plaza')}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
          >
            {t('personaEntry.enterJobPlaza')}
          </button>
          <button
            type="button"
            onClick={() => go('/')}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
          >
            {t('personaEntry.enterHomeCodernet')}
          </button>
        </div>
        <Link href="/" className="mt-8 inline-block text-sm text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline">
          ← {t('back')}
        </Link>
      </div>
    </MainLayout>
  );
}
