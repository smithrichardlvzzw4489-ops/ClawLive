'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/i18n/LocaleContext';

/**
 * 独立语言切换器，用于登录/注册等无 Header 的页面
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-4 right-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 rounded-lg border border-gray-200 bg-white/80 hover:bg-white text-gray-600 hover:text-lobster transition-colors text-sm font-medium flex items-center gap-1"
      >
        {locale === 'zh' ? '中文' : 'EN'}
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border py-1 z-50">
            <button
              type="button"
              onClick={() => { setLocale('zh'); setOpen(false); }}
              className={`block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${locale === 'zh' ? 'text-lobster font-medium' : 'text-gray-700'}`}
            >
              {t('langZh')}
            </button>
            <button
              type="button"
              onClick={() => { setLocale('en'); setOpen(false); }}
              className={`block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${locale === 'en' ? 'text-lobster font-medium' : 'text-gray-700'}`}
            >
              {t('langEn')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
