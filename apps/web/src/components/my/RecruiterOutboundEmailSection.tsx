'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, APIError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

type Props = {
  initialEmail: string | null;
  onSaved?: (email: string | null) => void;
  /** dark：GITLINK /my/profile；light：实验室风 /my-profile */
  variant?: 'dark' | 'light';
};

export function RecruiterOutboundEmailSection({ initialEmail, onSaved, variant = 'dark' }: Props) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initialEmail ?? '');
  useEffect(() => {
    setDraft(initialEmail ?? '');
  }, [initialEmail]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    const reOut = trimmed === '' ? null : trimmed.toLowerCase();
    if ((reOut || '') === (initialEmail ?? '')) return;
    setSaving(true);
    setErr(null);
    setHint(null);
    try {
      await api.auth.updateMe({ recruiterOutboundEmail: reOut });
      onSaved?.(reOut);
      setHint(t('myProfileCenter.profileSaved'));
      setTimeout(() => setHint(null), 2400);
    } catch (e) {
      const code = e instanceof APIError ? e.message : '';
      setErr(
        code === 'RECRUITER_EMAIL_INVALID'
          ? t('myProfileCenter.profileRecruiterEmailInvalid')
          : e instanceof APIError
            ? e.message
            : t('myProfileCenter.profileSaveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }, [draft, initialEmail, onSaved, t]);

  const dirty = (draft.trim() || '') !== (initialEmail ?? '');

  const isDark = variant === 'dark';

  return (
    <section
      className={
        isDark
          ? 'rounded-2xl border border-cyan-500/20 bg-cyan-950/15 p-5 mb-6'
          : 'rounded-xl border border-gray-200/90 bg-gray-50/50 p-4 mb-4'
      }
    >
      <h2 className={`text-sm font-semibold ${isDark ? 'text-cyan-100' : 'text-gray-800'}`}>
        {t('myProfileCenter.profileRecruiterEmail')}
      </h2>
      <p
        className={`mt-1 text-[11px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-gray-500'}`}
      >
        {t('myProfileCenter.profileRecruiterEmailHint')}
      </p>
      <input
        type="email"
        autoComplete="email"
        inputMode="email"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="you@company.com"
        className={
          isDark
            ? 'mt-3 w-full max-w-lg rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/35 placeholder:text-slate-600'
            : 'mt-3 w-full max-w-md rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-lobster/40 focus:ring-2 focus:ring-lobster/15'
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void save()}
          className={
            isDark
              ? 'rounded-lg bg-cyan-700/80 hover:bg-cyan-600 disabled:opacity-40 px-4 py-2 text-xs font-semibold text-white transition-colors'
              : 'rounded-xl bg-lobster px-4 py-2 text-sm font-semibold text-white transition hover:bg-lobster-dark disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          {saving ? '…' : t('myProfileCenter.profileSave')}
        </button>
        {hint && <span className={`text-sm ${isDark ? 'text-emerald-400/90' : 'text-green-600'}`}>{hint}</span>}
      </div>
      {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
    </section>
  );
}
