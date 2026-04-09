'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type Stage = 'exchanging' | 'success' | 'error';

type CallbackError = { kind: 'i18n'; key: string } | { kind: 'raw'; text: string };

function GitHubCallbackInner() {
  const router = useRouter();
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const ghError = searchParams.get('error');

  const [stage, setStage] = useState<Stage>('exchanging');
  const [callbackError, setCallbackError] = useState<CallbackError | null>(null);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (ghError || !code) {
      setStage('error');
      setCallbackError(
        ghError === 'access_denied'
          ? { kind: 'i18n', key: 'auth.oauthDenied' }
          : { kind: 'i18n', key: 'auth.oauthNoCode' },
      );
      return;
    }

    (async () => {
      try {
        const base = API_BASE_URL || '';
        const res = await fetch(`${base}/api/auth/github`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (!res.ok || !data.token) {
          setStage('error');
          const detail = (data.detail || data.error || '') as string;
          setCallbackError(
            detail
              ? { kind: 'raw', text: detail }
              : { kind: 'i18n', key: 'auth.oauthFailGeneric' },
          );
          return;
        }

        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);

        setStage('success');
        const next =
          typeof window !== 'undefined' ? sessionStorage.getItem('post_oauth_redirect') : null;
        if (typeof window !== 'undefined') sessionStorage.removeItem('post_oauth_redirect');
        const path = next && next.startsWith('/') ? next : '/';
        router.replace(path);
      } catch (err) {
        setStage('error');
        setCallbackError(
          err instanceof Error && err.message
            ? { kind: 'raw', text: err.message }
            : { kind: 'i18n', key: 'auth.oauthNetworkError' },
        );
      }
    })();
  }, [code, ghError, router]);

  return (
    <div className="relative min-h-screen bg-[#06080f] flex items-center justify-center p-4">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>
      <div className="pointer-events-none absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/25 blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/25 blur-[160px]" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.05] p-8 text-center shadow-2xl backdrop-blur-xl">
        {stage === 'exchanging' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            <p className="text-white/70 text-sm">{t('auth.oauthExchanging')}</p>
          </>
        )}
        {stage === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white/80 text-sm">{t('auth.oauthSuccessRedirect')}</p>
          </>
        )}
        {stage === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-lg font-bold">!</div>
            <p className="mb-4 text-red-300 text-sm">
              {callbackError
                ? callbackError.kind === 'i18n'
                  ? t(callbackError.key)
                  : callbackError.text
                : ''}
            </p>
            <button
              onClick={() => router.push('/login')}
              className="rounded-lg bg-white/[0.1] px-5 py-2 text-sm text-white transition hover:bg-white/[0.15]"
            >
              {t('auth.oauthBackToLogin')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GitHubCallbackSuspenseFallback() {
  const { t } = useLocale();
  return (
    <div className="relative min-h-screen bg-[#06080f] flex flex-col items-center justify-center gap-3">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      <p className="text-sm text-white/50">{t('loading')}</p>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<GitHubCallbackSuspenseFallback />}>
      <GitHubCallbackInner />
    </Suspense>
  );
}
