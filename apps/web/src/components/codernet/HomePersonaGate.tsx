'use client';

import { useLocale } from '@/lib/i18n/LocaleContext';

type Props = {
  onSelect: (role: 'developer' | 'recruiter') => void;
};

/**
 * 首页未选择身份时：双入口，与顶栏菜单严格对应两套能力。
 */
export function HomePersonaGate({ onSelect }: Props) {
  const { t } = useLocale();

  return (
    <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] max-w-5xl flex-col justify-center px-4 py-12 sm:py-16">
      <h1 className="mb-8 text-center text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl">
        {t('personaGate.title')}
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        <button
          type="button"
          onClick={() => onSelect('developer')}
          className="group flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-left transition hover:border-lobster/35 hover:bg-lobster/[0.06] sm:p-8"
        >
          <span className="mb-3 text-2xl" aria-hidden>
            👤
          </span>
          <span className="text-lg font-bold text-white">{t('personaGate.developerCardTitle')}</span>
          <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
            <li className="flex items-center gap-2">
              <span className="text-lobster">✓</span> {t('personaGate.developerBullet1')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-lobster">✓</span> {t('personaGate.developerBullet2')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-lobster">✓</span> {t('personaGate.developerBullet3')}
            </li>
          </ul>
          <span className="mt-6 text-sm font-semibold text-lobster group-hover:underline">
            {t('personaGate.developerCta')} →
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelect('recruiter')}
          className="group flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-left transition hover:border-violet-500/40 hover:bg-violet-500/[0.07] sm:p-8"
        >
          <span className="mb-3 text-2xl" aria-hidden>
            📋
          </span>
          <span className="text-lg font-bold text-white">{t('personaGate.recruiterCardTitle')}</span>
          <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span> {t('personaGate.recruiterBullet1')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span> {t('personaGate.recruiterBullet2')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span> {t('personaGate.recruiterBullet3')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span> {t('personaGate.recruiterBullet4')}
            </li>
          </ul>
          <span className="mt-6 text-sm font-semibold text-violet-300 group-hover:underline">
            {t('personaGate.recruiterCta')} →
          </span>
        </button>
      </div>
    </div>
  );
}
