'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError, resolveMediaUrl } from '@/lib/api';

type JobRow = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  jobTitle: string;
  companyName: string | null;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  narrative: string;
  updatedAt: string;
};

type SeekerRow = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  title: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  narrative: string;
  updatedAt: string;
};

function salaryLine(min: number | null, max: number | null): string {
  if (min == null && max == null) return '面议 / 未填';
  if (min != null && max != null) return `${min.toLocaleString()} – ${max.toLocaleString()} 元/月`;
  if (min != null) return `≥ ${min.toLocaleString()} 元/月`;
  return `≤ ${max!.toLocaleString()} 元/月`;
}

export function JobsMarketClient() {
  const [tab, setTab] = useState<'jobs' | 'talent'>('jobs');
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [seekers, setSeekers] = useState<SeekerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [j, s] = await Promise.all([
        api.jobA2A.publicJobs(100) as Promise<{ jobs: JobRow[] }>,
        api.jobA2A.publicSeekers(100) as Promise<{ seekers: SeekerRow[] }>,
      ]);
      setJobs(j.jobs || []);
      setSeekers(s.seekers || []);
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl px-4 py-10 text-white">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">在招广场</h1>
            <p className="mt-1 text-sm text-slate-500">
              招聘方发布的岗位与求职者公开简历（可在对应页面关闭「公开展示」）
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/jobs/post"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition"
            >
              发布岗位
            </Link>
            <Link
              href="/jobs/resume"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 transition"
            >
              我的简历
            </Link>
            <Link
              href="/job-a2a"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition"
            >
              A2A 匹配实验室
            </Link>
          </div>
        </div>

        <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setTab('jobs')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === 'jobs' ? 'bg-violet-600/40 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            在招岗位 ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('talent')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === 'talent' ? 'bg-violet-600/40 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            求职者 ({seekers.length})
          </button>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {err}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          </div>
        ) : tab === 'jobs' ? (
          <ul className="space-y-4">
            {jobs.length === 0 ? (
              <li className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-500">
                暂无在招岗位。招聘方可前往「发布岗位」填写并勾选公开展示。
              </li>
            ) : (
              jobs.map((j) => (
                <li
                  key={j.userId}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-sm"
                >
                  <div className="flex gap-4">
                    {j.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(j.avatarUrl)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-600/30 text-lg font-bold text-violet-200">
                        {(j.companyName || j.jobTitle)[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h2 className="text-lg font-semibold text-white">{j.jobTitle}</h2>
                        {j.companyName && (
                          <span className="text-sm text-slate-400">{j.companyName}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 font-mono">
                        @{j.username} · {j.city || '地点未填'} · {salaryLine(j.salaryMin, j.salaryMax)}
                      </p>
                      {j.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {j.skills.map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono text-slate-300"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-sm text-slate-400 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {j.narrative}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        <Link
                          href={`/codernet/card/${encodeURIComponent(j.username)}`}
                          className="text-sky-400 hover:underline"
                        >
                          技术画像 ↗
                        </Link>
                        <span className="text-slate-600">
                          更新 {new Date(j.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="space-y-4">
            {seekers.length === 0 ? (
              <li className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-500">
                暂无公开简历。求职者可前往「我的简历」完善并勾选公开展示。
              </li>
            ) : (
              seekers.map((s) => (
                <li
                  key={s.userId}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-sm"
                >
                  <div className="flex gap-4">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(s.avatarUrl)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-600/30 text-lg font-bold text-emerald-200">
                        {s.username[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-white">{s.title}</h2>
                      <p className="mt-1 text-xs text-slate-500 font-mono">
                        @{s.username} · {s.city || '地点未填'} · {salaryLine(s.salaryMin, s.salaryMax)}
                      </p>
                      {s.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.skills.map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-mono text-emerald-200/90"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-sm text-slate-400 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {s.narrative}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        <Link
                          href={`/codernet/card/${encodeURIComponent(s.username)}`}
                          className="text-sky-400 hover:underline"
                        >
                          技术画像 ↗
                        </Link>
                        <span className="text-slate-600">
                          更新 {new Date(s.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
