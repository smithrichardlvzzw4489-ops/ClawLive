'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, resolveMediaUrl } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

type ProfilePayload = {
  profile: {
    user: { id: string; username: string; avatarUrl: string | null; bio: string | null };
    darwin: { displayName: string; appliedAt: string | null };
    skills: {
      count: number;
      items: Array<{
        skillId: string;
        title: string;
        description: string;
        source: 'platform' | 'web-learned';
        installedAt: string;
      }>;
    };
    evolutionPoints: Array<{
      id: string;
      title: string;
      status: string;
      updatedAt: string;
      goal: string;
    }>;
    evolverRounds: Array<{
      id: string;
      roundNo: number;
      status: string;
      summary: string | null;
      startedAt: string;
      completedAt: string | null;
    }>;
  };
};

export default function DarwinProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(String(params.username ?? ''));
  const { t } = useLocale();
  const [data, setData] = useState<ProfilePayload['profile'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloneMsg, setCloneMsg] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = (await api.darwin.profile(username)) as ProfilePayload;
      setData(r.profile);
    } catch {
      setData(null);
      setError(t('darwinShowcase.notFound'));
    } finally {
      setLoading(false);
    }
  }, [username, t]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleClone = async () => {
    if (!data) return;
    setCloneMsg(null);
    setCloning(true);
    try {
      const r = (await api.darwin.cloneSkills({ sourceUserId: data.user.id })) as {
        ok?: boolean;
        message?: string;
      };
      setCloneMsg(r.message ?? t('darwinShowcase.cloneOk'));
    } catch (e) {
      setCloneMsg(e instanceof Error ? e.message : t('darwinShowcase.cloneFail'));
    } finally {
      setCloning(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 text-sm">
          <Link href="/darwin" className="text-slate-400 transition hover:text-white">
            ← {t('darwinShowcase.title')}
          </Link>
        </div>

        {loading && <p className="text-slate-500">{t('darwinShowcase.loading')}</p>}
        {error && <p className="text-slate-400">{error}</p>}

        {data && (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/10">
                {data.user.avatarUrl ? (
                  <Image
                    src={resolveMediaUrl(data.user.avatarUrl)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-4xl">🧬</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{data.darwin.displayName}</h1>
                <p className="text-slate-500">@{data.user.username}</p>
                {data.user.bio && <p className="mt-2 text-sm text-slate-400">{data.user.bio}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  {t('darwinShowcase.skillCount')}:{' '}
                  <span className="text-lobster font-semibold tabular-nums">{data.skills.count}</span>
                </p>
              </div>
            </div>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-white">{t('darwinShowcase.skillsSection')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('darwinShowcase.skillsHint')}</p>
              <ul className="mt-4 space-y-2">
                {data.skills.items.length === 0 && (
                  <li className="text-sm text-slate-500">—</li>
                )}
                {data.skills.items.map((s) => (
                  <li
                    key={s.skillId}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-white">{s.title}</p>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{s.description}</p>
                    <p className="mt-2 text-xs text-slate-600">
                      {s.source === 'platform' ? t('darwinShowcase.sourcePlatform') : t('darwinShowcase.sourceWeb')}{' '}
                      · {new Date(s.installedAt).toLocaleString('zh-CN')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-white">{t('darwinShowcase.evoPointsSection')}</h2>
              <ul className="mt-4 space-y-2">
                {data.evolutionPoints.length === 0 && (
                  <li className="text-sm text-slate-500">—</li>
                )}
                {data.evolutionPoints.map((p) => (
                  <li key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                    <Link href={`/evolution-network/point/${p.id}`} className="font-medium text-lobster hover:underline">
                      {p.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{p.goal}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {t('darwinShowcase.evoStatus')}: {p.status}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-white">{t('darwinShowcase.evolverSection')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('darwinShowcase.evolutionResult')}</p>
              <ul className="mt-4 space-y-2">
                {data.evolverRounds.length === 0 && (
                  <li className="text-sm text-slate-500">—</li>
                )}
                {data.evolverRounds.map((r) => (
                  <li key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                    <p className="font-medium text-white">
                      第 {r.roundNo} 轮 · {r.status}
                    </p>
                    {r.summary && <p className="mt-2 text-slate-300">{r.summary}</p>}
                    <p className="mt-2 text-xs text-slate-600">
                      {new Date(r.startedAt).toLocaleString('zh-CN')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10 rounded-2xl border border-lobster/20 bg-lobster/5 p-6">
              <h2 className="text-lg font-semibold text-white">{t('darwinShowcase.cloneTitle')}</h2>
              <p className="mt-2 text-sm text-slate-400">{t('darwinShowcase.cloneHint')}</p>
              {!token ? (
                <p className="mt-4 text-sm text-slate-500">
                  <Link href="/login" className="text-lobster underline">
                    {t('login')}
                  </Link>
                  {t('darwinShowcase.cloneLogin')}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={cloning || data.skills.count === 0}
                    onClick={() => void handleClone()}
                    className="mt-4 rounded-xl bg-lobster px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    {cloning ? '…' : t('darwinShowcase.cloneButton')}
                  </button>
                  {cloneMsg && <p className="mt-3 text-sm text-slate-300">{cloneMsg}</p>}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
}
