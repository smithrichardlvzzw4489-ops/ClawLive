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
  const [mode, setMode] = useState<Mode>('login');

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
      const response = await api.auth.register(
        formData.username,
        formData.email,
        formData.password,
        avatarDataUrl
      );
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/');
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

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h1>
        </div>

        {connStatus !== 'ok' && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${connStatus === 'checking' ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {connStatus === 'checking'
              ? `正在检测后端连通性... (${API_BASE_URL})`
              : `后端不可达: ${connDetail}`}
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            type="button"
            onClick={switchToLogin}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-white text-lobster shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('auth.loginBtn')}
          </button>
          <button
            type="button"
            onClick={switchToRegister}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-white text-lobster shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('auth.registerBtn')}
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className={`px-4 py-3 rounded-lg ${userNotFound ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.username')}</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.loggingIn') : t('auth.loginBtn')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.avatarLabel')}</label>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition hover:border-lobster/50 hover:bg-rose-50/50"
                >
                  {avatarDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl">+</span>
                  )}
                </button>
                <div className="min-w-0 flex-1 text-center text-sm text-gray-500 sm:text-left">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.username')}</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
                minLength={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.email')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.password')}</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.registering') : t('auth.registerBtn')}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
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
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← {SHOW_LIVE_FEATURES ? t('auth.backToRooms') : t('auth.backToHome')}
          </Link>
        </div>
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
