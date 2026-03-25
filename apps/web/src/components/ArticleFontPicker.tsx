'use client';

import { useArticleFont, type ArticleFontPreset } from '@/components/ArticleFontProvider';
import { useLocale } from '@/lib/i18n/LocaleContext';

const ORDER: ArticleFontPreset[] = ['noto-sans', 'noto-serif', 'xiaowei', 'system'];

export function ArticleFontPicker({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  const { preset, setPreset } = useArticleFont();

  return (
    <label className={`inline-flex items-center gap-2 text-sm text-gray-600 ${className}`}>
      <span className="shrink-0 whitespace-nowrap">{t('feedPost.articleFontLabel')}</span>
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value as ArticleFontPreset)}
        className="max-w-[11rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-lobster focus:outline-none focus:ring-2 focus:ring-lobster/25"
        aria-label={t('feedPost.articleFontLabel')}
      >
        {ORDER.map((id) => (
          <option key={id} value={id}>
            {t(`feedPost.articleFontPreset.${id}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
