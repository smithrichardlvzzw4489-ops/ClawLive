'use client';

import type { Locale } from '@/lib/i18n/translations';
import { useLocale } from '@/lib/i18n/LocaleContext';

const btn =
  'rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition sm:px-2.5 sm:text-xs';
const inactive = 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-200';
const active = 'bg-white/[0.12] text-white shadow-sm';

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  const pick = (next: Locale) => {
    setLocale(next);
  };

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.04] p-0.5 ${className}`}
      role="group"
      aria-label={t('language')}
    >
      <button
        type="button"
        className={`${btn} ${locale === 'en' ? active : inactive}`}
        aria-pressed={locale === 'en'}
        onClick={() => pick('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`${btn} ${locale === 'zh' ? active : inactive}`}
        aria-pressed={locale === 'zh'}
        onClick={() => pick('zh')}
      >
        中文
      </button>
    </div>
  );
}
