'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';
import { LanguageToggle } from '@/components/LanguageToggle';

function AuthForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const { t } = useLocale();
  const isAgentKeyFlow = redirectTo === '/agent-keys';

  const [connStatus, setConnStatus] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [connDetail, setConnDetail] = useState('');

  const githubClientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(`/api/health`, { signal: ctrl.signal })
      .then((r) => {
        clearTimeout(timer);
        if (r.ok) {
          setConnStatus('ok');
        } else {
          setConnStatus('fail');
          setConnDetail(`HTTP ${r.status}`);
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        setConnStatus('fail');
        setConnDetail(`${err?.message || err}`);
      });
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  const startGithubOAuth = () => {
    if (!githubClientId) return;
    const redirect = `${window.location.origin}/auth/github/callback`;
    const after = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/';
    sessionStorage.setItem('post_oauth_redirect', after);
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=read:user,user:email,public_repo`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06080f] flex items-center justify-center p-4">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>
      <div className="pointer-events-none absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/25 blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/25 blur-[160px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.05] p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white">{t('auth.loginTitle')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('auth.loginSubtitle')}</p>
        </div>

        {isAgentKeyFlow && (
          <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            <p className="font-semibold mb-0.5">{t('auth.agentKeysGithubTitle')}</p>
            <p className="text-amber-400/80">{t('auth.agentKeysGithubBody')}</p>
          </div>
        )}

        {connStatus !== 'ok' && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              connStatus === 'checking'
                ? 'border border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
                : 'border border-red-400/20 bg-red-400/10 text-red-300'
            }`}
          >
            {connStatus === 'checking'
              ? t('auth.connChecking', { apiBase: API_BASE_URL || '—' })
              : t('auth.connFail', { detail: connDetail })}
          </div>
        )}

        {!githubClientId && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm border border-red-400/20 bg-red-400/10 text-red-300">
            {t('auth.githubClientMissing')}
          </div>
        )}

        <button
          type="button"
          disabled={!githubClientId}
          onClick={startGithubOAuth}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/[0.1] bg-white/[0.06] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          {t('auth.githubSignIn')}
        </button>

        <div className="mt-8 text-center">
          <Link
            href={SHOW_LIVE_FEATURES ? '/rooms' : '/'}
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← {SHOW_LIVE_FEATURES ? t('auth.backToRooms') : t('auth.backToHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoginLoadingFallback() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-violet-400" />
        <p className="text-white/60">{t('loading')}</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoadingFallback />}>
      <AuthForm />
    </Suspense>
  );
}
