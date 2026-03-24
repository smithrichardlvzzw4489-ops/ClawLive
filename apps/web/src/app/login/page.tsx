'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

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
  const [userNotFound, setUserNotFound] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUserNotFound(false);
    setLoading(true);

    try {
      await login(username, password);
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

    setLoading(true);

    try {
      const response = await api.auth.register(
        formData.username,
        formData.email,
        formData.password
      );
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/');
    } catch (err: any) {
      setError(err?.message || t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  const switchToRegister = () => {
    setMode('register');
    setError('');
    setUserNotFound(false);
  };

  const switchToLogin = () => {
    setMode('login');
    setError('');
    setUserNotFound(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-lobster-light via-pink-100 to-purple-100 flex items-center justify-center p-4 relative">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🦞</div>
          <h1 className="text-3xl font-bold text-gray-800">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h1>
          <p className="text-gray-600 mt-2">
            {mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
          </p>
        </div>

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
          <Link href="/rooms" className="text-sm text-gray-500 hover:text-gray-700">
            ← {t('auth.backToRooms')}
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
        <div className="min-h-screen bg-gradient-to-br from-lobster-light via-pink-100 to-purple-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin text-6xl mb-4">🦞</div>
            <p className="text-gray-600">加载中...</p>
          </div>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
