'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';

type Stage = 'exchanging' | 'success' | 'error';

const STATE_KEY = 'linkedin_oauth_state';
const REDIRECT_KEY = 'post_oauth_redirect';

function LinkedInCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const err = searchParams.get('error');
  const state = searchParams.get('state');
  const desc = searchParams.get('error_description');

  const [stage, setStage] = useState<Stage>('exchanging');
  const [errorMsg, setErrorMsg] = useState('');
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (err) {
      setStage('error');
      setErrorMsg(
        err === 'user_cancelled_login' || err === 'access_denied'
          ? '你取消了 LinkedIn 授权'
          : desc || err || 'LinkedIn 授权失败',
      );
      return;
    }

    if (!code) {
      setStage('error');
      setErrorMsg('未获取到授权码');
      return;
    }

    const storedState = typeof window !== 'undefined' ? sessionStorage.getItem(STATE_KEY) : null;
    if (typeof window !== 'undefined') sessionStorage.removeItem(STATE_KEY);
    if (!state || !storedState || state !== storedState) {
      setStage('error');
      setErrorMsg('安全校验失败，请返回登录页重试');
      return;
    }

    const redirectUri = `${window.location.origin}/auth/linkedin/callback`;

    (async () => {
      try {
        const base = API_BASE_URL || '';
        const res = await fetch(`${base}/api/auth/linkedin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });
        const data = await res.json();

        if (!res.ok || !data.token) {
          setStage('error');
          setErrorMsg(data.detail || data.error || 'LinkedIn 登录失败');
          return;
        }

        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);

        setStage('success');
        const next =
          typeof window !== 'undefined' ? sessionStorage.getItem(REDIRECT_KEY) || '/' : '/';
        if (typeof window !== 'undefined') sessionStorage.removeItem(REDIRECT_KEY);
        const path = next.startsWith('/') ? next : '/';
        router.replace(path);
      } catch (e) {
        setStage('error');
        setErrorMsg(e instanceof Error ? e.message : '网络错误');
      }
    })();
  }, [code, err, state, desc, router]);

  return (
    <div className="min-h-screen bg-[#06080f] flex items-center justify-center p-4">
      <div className="pointer-events-none absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-[#0A66C2]/20 blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/20 blur-[160px]" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.05] p-8 text-center shadow-2xl backdrop-blur-xl">
        {stage === 'exchanging' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#0A66C2] border-t-transparent" />
            <p className="text-white/70 text-sm">正在完成 LinkedIn 登录…</p>
          </>
        )}
        {stage === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 text-green-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white/80 text-sm">登录成功，正在跳转…</p>
          </>
        )}
        {stage === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-lg font-bold">
              !
            </div>
            <p className="mb-4 text-red-300 text-sm">{errorMsg}</p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="rounded-lg bg-white/[0.1] px-5 py-2 text-sm text-white transition hover:bg-white/[0.15]"
            >
              返回登录
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LinkedInCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#0A66C2] border-t-transparent" />
        </div>
      }
    >
      <LinkedInCallbackInner />
    </Suspense>
  );
}
