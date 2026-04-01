'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { api, API_BASE_URL, SERVER_API_URL } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

type Mode = 'login' | 'register';

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const { login } = useAuth();
  const { t } = useLocale();
  const isAgentKeyFlow = redirectTo === '/agent-keys';
  const [mode, setMode] = useState<Mode>(isAgentKeyFlow ? 'register' : 'login');

  // Login
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connStatus, setConnStatus] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [connDetail, setConnDetail] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(`/api/health`, { signal: ctrl.signal })
      .then(r => {
        clearTimeout(timer);
        if (r.ok) { setConnStatus('ok'); }
        else { setConnStatus('fail'); setConnDetail(`HTTP ${r.status}`); }
      })
      .catch(err => {
        clearTimeout(timer);
        setConnStatus('fail');
        setConnDetail(`${err?.message || err}`);
      });
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, []);
  const [userNotFound, setUserNotFound] = useState(false);
  /** 注册成功后一次性展示外部小龙虾 Open API Key */
  const [lobsterPack, setLobsterPack] = useState<{
    apiKey: string;
    skillTitle: string;
    note: string;
  } | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUserNotFound(false);
    setLoading(true);

    try {
      await login(username.trim(), password);
      router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'USER_NOT_FOUND') {
        setUserNotFound(true);
        setError(t('auth.userNotFoundPrompt'));
      } else {
        setError(msg || t('auth.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUserNotFound(false);

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (formData.password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    if (!avatarDataUrl) {
      setError(t('auth.avatarRequired'));
      return;
    }

    setLoading(true);

    try {
      const response = (await api.auth.register(
        formData.username,
        formData.email,
        formData.password,
        avatarDataUrl
      )) as {
        token: string;
        refreshToken: string;
        externalLobsterJobPack?: {
          apiKey: string;
          skillTitle: string;
          note: string;
        };
      };
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      const pack = response.externalLobsterJobPack;
      if (pack?.apiKey) {
        setLobsterPack({
          apiKey: pack.apiKey,
          skillTitle: pack.skillTitle,
          note: pack.note,
        });
      } else {
        router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/');
      }
    } catch (err: any) {
      const m = err?.message as string | undefined;
      if (m === 'AVATAR_REQUIRED') setError(t('auth.avatarRequired'));
      else if (m === 'INVALID_AVATAR') setError(t('auth.avatarInvalid'));
      else setError(m || t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  const switchToRegister = () => {
    setMode('register');
    setError('');
    setUserNotFound(false);
    setAvatarDataUrl(null);
  };

  const switchToLogin = () => {
    setMode('login');
    setError('');
    setUserNotFound(false);
    setAvatarDataUrl(null);
  };

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('auth.avatarInvalidType'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(t('auth.avatarTooLarge'));
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarDataUrl(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06080f] flex items-center justify-center p-4">
      {/* 科技感背景光晕 */}
      <div className="pointer-events-none absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/25 blur-[160px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/25 blur-[160px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      {/* 细格网纹理 */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

      {/* 玻璃卡片 */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.05] p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h1>
        </div>

        {isAgentKeyFlow && (
          <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            <p className="font-semibold mb-0.5">🤖 你的 Agent 正在等待接入 ClawLab</p>
            <p className="text-amber-400/80">注册或登录后，你将进入 API Key 生成页面，把 Key 复制给你的 Agent 即可完成接入。</p>
          </div>
        )}

        {connStatus !== 'ok' && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${connStatus === 'checking' ? 'border border-yellow-400/20 bg-yellow-400/10 text-yellow-300' : 'border border-red-400/20 bg-red-400/10 text-red-300'}`}>
            {connStatus === 'checking'
              ? `正在检测后端连通性... (${API_BASE_URL})`
              : `后端不可达: ${connDetail}`}
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex rounded-lg bg-white/[0.06] border border-white/[0.08] p-1 mb-6">
          <button
            type="button"
            onClick={switchToLogin}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-white/[0.12] text-lobster shadow-sm border border-white/[0.1]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('auth.loginBtn')}
          </button>
          <button
            type="button"
            onClick={switchToRegister}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'register'
                ? 'bg-white/[0.12] text-lobster shadow-sm border border-white/[0.1]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('auth.registerBtn')}
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className={`px-4 py-3 rounded-lg text-sm ${userNotFound ? 'border border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border border-red-400/20 bg-red-400/10 text-red-300'}`}>
                {error}
                {userNotFound && (
                  <button
                    type="button"
                    onClick={switchToRegister}
                    className="block mt-2 text-lobster font-semibold hover:underline"
                  >
                    → {t('auth.registerNow')}
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.username')}</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.07] border border-white/[0.1] text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-lobster/40 focus:border-lobster/40 transition"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.07] border border-white/[0.1] text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-lobster/40 focus:border-lobster/40 transition"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg font-semibold text-white bg-lobster hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-lobster/20"
            >
              {loading ? t('auth.loggingIn') : t('auth.loginBtn')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="border border-red-400/20 bg-red-400/10 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.avatarLabel')}</label>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/20 bg-white/[0.05] text-slate-400 transition hover:border-lobster/50 hover:bg-lobster/5"
                >
                  {avatarDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl">+</span>
                  )}
                </button>
                <div className="min-w-0 flex-1 text-center text-sm text-slate-400 sm:text-left">
                  <p>{t('auth.avatarHint')}</p>
                  {avatarDataUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarDataUrl(null)}
                      className="mt-1 text-lobster hover:underline"
                    >
                      {t('auth.avatarRemove')}
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={onAvatarFile}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.username')}</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.07] border border-white/[0.1] text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-lobster/40 focus:border-lobster/40 transition"
                required
                minLength={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.email')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.07] border border-white/[0.1] text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-lobster/40 focus:border-lobster/40 transition"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.password')}</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.07] border border-white/[0.1] text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-lobster/40 focus:border-lobster/40 transition"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.07] border border-white/[0.1] text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-lobster/40 focus:border-lobster/40 transition"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg font-semibold text-white bg-lobster hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-lobster/20"
            >
              {loading ? t('auth.registering') : t('auth.registerBtn')}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-slate-400">
          {mode === 'login' ? (
            <>
              {t('auth.noAccount')}{' '}
              <button type="button" onClick={switchToRegister} className="text-lobster font-semibold hover:underline">
                {t('auth.registerNow')}
              </button>
            </>
          ) : (
            <>
              {t('auth.hasAccount')}{' '}
              <button type="button" onClick={switchToLogin} className="text-lobster font-semibold hover:underline">
                {t('auth.loginNow')}
              </button>
            </>
          )}
        </div>

        <div className="mt-4 text-center">
          <Link
            href={SHOW_LIVE_FEATURES ? '/rooms' : '/'}
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← {SHOW_LIVE_FEATURES ? t('auth.backToRooms') : t('auth.backToHome')}
          </Link>
        </div>

        {lobsterPack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-emerald-400/30 bg-[#0c1018] p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-white">外部小龙虾 · Open API Key</h2>
              <p className="mt-2 text-sm text-slate-400">
                已为你的账号生成求职桥接 Key 与待审核技能（仅你可见）。请立即复制保存；完整 Markdown 见「技能 → 我发布的」。
              </p>
              <p className="mt-1 text-xs text-amber-400/90">{lobsterPack.note}</p>
              <p className="mt-3 text-xs text-slate-500">技能标题：{lobsterPack.skillTitle}</p>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs break-all text-emerald-300">
                {lobsterPack.apiKey}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                  onClick={() => {
                    void navigator.clipboard.writeText(lobsterPack.apiKey);
                  }}
                >
                  复制 Key
                </button>
                <Link
                  href="/skills?tab=my"
                  className="inline-flex items-center rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                >
                  查看技能全文
                </Link>
                <button
                  type="button"
                  className="rounded-lg bg-lobster px-4 py-2 text-sm font-medium text-white hover:bg-lobster-dark"
                  onClick={() => {
                    setLobsterPack(null);
                    router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/');
                  }}
                >
                  我已保存，进入站点
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-violet-400" />
            <p className="text-white/60">加载中...</p>
          </div>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
