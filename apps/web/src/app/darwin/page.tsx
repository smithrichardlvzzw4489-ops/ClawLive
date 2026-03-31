'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MainLayout } from '@/components/MainLayout';
import { api, resolveMediaUrl } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

type DirectoryUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  skillCount: number;
  evolutionPointCount: number;
  darwinDisplayName: string | null;
};

export default function DarwinShowcasePage() {
  const { t } = useLocale();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = (await api.darwin.directory({ limit: 48 })) as { users: DirectoryUser[] };
        if (!cancelled) setUsers(r.users ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('darwinShowcase.title')}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{t('darwinShowcase.subtitle')}</p>

        {loading && (
          <p className="mt-10 text-center text-slate-500">{t('darwinShowcase.loading')}</p>
        )}
        {error && (
          <p className="mt-10 text-center text-red-400/90">{error}</p>
        )}
        {!loading && !error && users.length === 0 && (
          <p className="mt-10 text-center text-slate-500">{t('darwinShowcase.empty')}</p>
        )}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/darwin/${encodeURIComponent(u.username)}`}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-lobster/30 hover:bg-white/[0.05]"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/10">
                  {u.avatarUrl ? (
                    <Image
                      src={resolveMediaUrl(u.avatarUrl)}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl">🧬</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {u.darwinDisplayName || u.username}
                    <span className="ml-2 text-sm font-normal text-slate-500">@{u.username}</span>
                  </p>
                  {u.bio && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{u.bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>
                      {t('darwinShowcase.skillCount')}:{' '}
                      <span className="text-lobster font-medium tabular-nums">{u.skillCount}</span>
                    </span>
                    <span>
                      {t('darwinShowcase.evoPointCount')}:{' '}
                      <span className="text-slate-300 tabular-nums">{u.evolutionPointCount}</span>
                    </span>
                  </div>
                  <span className="mt-2 inline-block text-sm text-lobster">{t('darwinShowcase.viewProfile')} →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MainLayout>
  );
}
