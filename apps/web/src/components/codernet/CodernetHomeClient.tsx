'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, APIError } from '@/lib/api';
import { withReturnTo } from '@/hooks/useHistoryBack';
import { MainLayout } from '@/components/MainLayout';
import { MathMatchPanel } from '@/components/math/MathMatchPanel';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { usePrimaryPersona } from '@/contexts/PrimaryPersonaContext';
import { HomePersonaGate } from '@/components/codernet/HomePersonaGate';

type TabId = 'lookup' | 'math';

const LOOKUP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CodernetHomeClient() {
  const { t } = useLocale();
  const { persona, personaReady, setPersona } = usePrimaryPersona();
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const here = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    [pathname, searchParams],
  );
  const [tab, setTab] = useState<TabId>('lookup');

  useEffect(() => {
    if (searchParams.get('tab') === 'math') setTab('math');
  }, [searchParams]);

  /** 求职者：首页始终回职位广场；招聘方：根路径默认进职位，`?view=hub` / `?tab=math` 进入开发者360画像 */
  useEffect(() => {
    if (!personaReady || pathname !== '/') return;
    if (persona === 'developer') {
      router.replace('/job-plaza');
      return;
    }
    if (persona !== 'recruiter') return;
    const tab = searchParams.get('tab');
    const view = searchParams.get('view');
    if (tab === 'math' || view === 'hub') return;
    router.replace('/job-plaza');
  }, [personaReady, persona, pathname, router, searchParams]);

  const selectTab = (next: TabId) => {
    setTab(next);
    if (persona === 'recruiter') {
      if (next === 'math') {
        router.replace('/?view=hub&tab=math', { scroll: false });
      } else {
        router.replace('/?view=hub', { scroll: false });
      }
    } else if (next === 'math') {
      router.replace('/?tab=math', { scroll: false });
    } else {
      router.replace('/', { scroll: false });
    }
  };

  const [searchValue, setSearchValue] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    const raw = searchValue.trim();
    if (!raw) return;

    if (LOOKUP_EMAIL_RE.test(raw)) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        router.push(`/login?redirect=${encodeURIComponent(here || '/')}`);
        return;
      }
      setLookupErr(null);
      setLookupBusy(true);
      try {
        const data = (await api.codernet.resolveGithubFromEmail(raw)) as {
          githubUsername?: string;
        };
        const gh = data.githubUsername?.trim().toLowerCase();
        if (!gh) {
          setLookupErr('未找到与该邮箱对应的 GitHub 账号');
          return;
        }
        router.push(withReturnTo(`/codernet/github/${encodeURIComponent(gh)}`, here));
      } catch (err) {
        if (err instanceof APIError) {
          if (err.status === 401) {
            router.push(`/login?redirect=${encodeURIComponent(here || '/')}`);
            return;
          }
          setLookupErr(err.message || '解析失败');
        } else {
          setLookupErr('网络异常，请稍后重试');
        }
      } finally {
        setLookupBusy(false);
      }
      return;
    }

    const val = raw.replace(/^@/, '').trim();
    if (!val) return;
    router.push(withReturnTo(`/codernet/github/${encodeURIComponent(val)}`, here));
  };

  return (
    <MainLayout>
      <div className="relative min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/15 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/10 blur-[160px]" />

      {!personaReady ? (
        <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-slate-500">
          {t('loading')}
        </div>
      ) : persona === 'developer' ? (
        <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-slate-500">
          {t('loading')}
        </div>
      ) : persona === 'unset' ? (
        <HomePersonaGate
          onSelect={(role) => {
            setPersona(role);
            router.replace('/job-plaza');
          }}
        />
      ) : (
      <>
      <div
        className={
          tab === 'math'
            ? 'relative z-10'
            : 'relative z-10 min-h-[calc(100dvh-4rem)]'
        }
      >
        <div
          className={`flex flex-col items-center px-4 ${
            tab === 'math'
              ? 'min-h-0 justify-start py-6 sm:py-8'
              : 'min-h-[calc(100dvh-4rem)] justify-center py-10 sm:py-16'
          }`}
        >
        <div className="text-center max-w-2xl w-full mx-auto">
          <h1 className="mb-8 text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-snug text-balance text-white">
            {t('codernetHome.titleRecruiter')}
          </h1>

          {/* Tab Switcher：GitHub 画像 · MATH（LINK 见顶栏独立页） */}
          <div className="grid grid-cols-2 gap-1 mb-6 bg-white/[0.04] rounded-xl p-1 max-w-xl mx-auto w-full">
            <button
              type="button"
              onClick={() => selectTab('lookup')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'lookup' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              GitHub 画像
            </button>
            <button
              type="button"
              onClick={() => selectTab('math')}
              className={`py-2 px-1.5 sm:px-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                tab === 'math' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              MATH
            </button>
          </div>

          {/* Lookup Tab */}
          {tab === 'lookup' && (
            <div className="max-w-md mx-auto">
              <form onSubmit={(e) => void handleLookup(e)} className="relative mb-4">
                <div className="flex rounded-xl border border-white/[0.1] bg-white/[0.04] overflow-hidden focus-within:border-violet-500/40 transition">
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => {
                      setSearchValue(e.target.value);
                      setLookupErr(null);
                    }}
                    placeholder="GitHub 用户名或邮箱"
                    className="flex-1 bg-transparent pl-4 pr-2 py-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={!searchValue.trim() || lookupBusy}
                    className="px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:cursor-not-allowed text-sm font-semibold transition shrink-0"
                  >
                    {lookupBusy ? '解析中…' : 'Generate'}
                  </button>
                </div>
                {lookupErr ? <p className="text-left text-xs text-red-300 mt-2 px-1">{lookupErr}</p> : null}
              </form>
              <div className="flex flex-wrap justify-center gap-2">
                <span className="text-[10px] text-slate-600 self-center mr-1">Try:</span>
                {['torvalds', 'yyx990803', 'tj', 'sindresorhus'].map((n) => (
                  <button
                    key={n}
                    onClick={() => router.push(withReturnTo(`/codernet/github/${encodeURIComponent(n)}`, here))}
                    className="text-xs font-mono px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-violet-300 hover:border-violet-500/30 transition"
                  >
                    @{n}
                  </button>
                ))}
              </div>
              <p className="text-center text-[11px] text-slate-500 mt-5 leading-relaxed px-1">
                要查看我的画像请到
                <Link href="/my/profile" className="text-violet-400/90 hover:text-violet-300 underline-offset-2 hover:underline mx-0.5">
                  个人账号 → My card
                </Link>
              </p>
            </div>
          )}

        </div>
        </div>

        {tab === 'math' && (
          <div className="w-full max-w-6xl mx-auto px-0 sm:px-2">
            <MathMatchPanel />
          </div>
        )}
      </div>

      <footer className="relative z-10 border-t border-white/[0.06] px-4 py-8 text-center">
        <a
          href="https://t.me/+BFwEnVC6HdE1NDJl"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-violet-300 hover:text-violet-200 transition"
        >
          欢迎进入社区交流
        </a>
        <p className="mt-2 max-w-lg mx-auto break-all text-[11px] font-mono text-slate-500">
          https://t.me/+BFwEnVC6HdE1NDJl
        </p>
      </footer>
      </>
      )}
    </div>
    </MainLayout>
  );
}
