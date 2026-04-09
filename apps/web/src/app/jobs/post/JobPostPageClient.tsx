'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

function parseSkills(s: string): string[] {
  return s
    .split(/[,，、\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function JobPostPageClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [city, setCity] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [skills, setSkills] = useState('');
  const [narrative, setNarrative] = useState('');
  const [publicVisible, setPublicVisible] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.replace('/login?redirect=/jobs/post');
      return;
    }
    setReady(true);
    (async () => {
      try {
        const d = (await api.jobA2A.dashboard()) as {
          employerProfile: {
            jobTitle: string;
            companyName: string | null;
            city: string | null;
            salaryMin: number | null;
            salaryMax: number | null;
            skills: unknown;
            narrative: string;
            active: boolean;
          } | null;
        };
        const p = d.employerProfile;
        if (p) {
          setJobTitle(p.jobTitle);
          setCompanyName(p.companyName || '');
          setCity(p.city || '');
          setSalaryMin(p.salaryMin != null ? String(p.salaryMin) : '');
          setSalaryMax(p.salaryMax != null ? String(p.salaryMax) : '');
          setSkills(Array.isArray(p.skills) ? (p.skills as string[]).join(', ') : '');
          setNarrative(p.narrative);
          setPublicVisible(p.active !== false);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [router]);

  const save = useCallback(async () => {
    setMsg(null);
    if (!jobTitle.trim()) {
      setMsg({ ok: false, text: '请填写岗位名称' });
      return;
    }
    setBusy(true);
    try {
      await api.jobA2A.saveEmployer({
        jobTitle: jobTitle.trim(),
        companyName: companyName.trim() || undefined,
        city: city.trim() || undefined,
        salaryMin: salaryMin.trim() ? Number(salaryMin) : undefined,
        salaryMax: salaryMax.trim() ? Number(salaryMax) : undefined,
        skills: parseSkills(skills),
        narrative: narrative.trim(),
        active: publicVisible,
      });
      setMsg({ ok: true, text: '已保存。在招广场与 A2A 匹配将使用此信息。' });
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof APIError ? e.message : '保存失败',
      });
    } finally {
      setBusy(false);
    }
  }, [jobTitle, companyName, city, salaryMin, salaryMax, skills, narrative, publicVisible]);

  if (!ready) {
    return (
      <MainLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-slate-500">验证登录…</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-xl px-4 py-10 text-white">
        <div className="mb-8">
          <Link href="/jobs" className="text-sm text-slate-500 hover:text-violet-400">
            ← 在招广场
          </Link>
          <h1 className="mt-4 text-2xl font-bold">发布岗位</h1>
          <p className="mt-1 text-sm text-slate-500">
            面向招聘方：填写后可在「在招广场」展示，并参与 A2A Agent 匹配实验。
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm">
          <label className="block">
            <span className="text-xs text-slate-500">岗位名称 *</span>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="如：高级后端工程师"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">公司 / 团队名称</span>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">工作城市</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="如：上海 / 远程"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">月薪下限（元）</span>
              <input
                type="number"
                min={0}
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">月薪上限（元）</span>
              <input
                type="number"
                min={0}
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-500">技能关键词（逗号分隔）</span>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono text-white outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="TypeScript, PostgreSQL, …"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">岗位描述 / 要求</span>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={6}
              className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="职责、任职要求、团队介绍等"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={publicVisible}
              onChange={(e) => setPublicVisible(e.target.checked)}
              className="rounded border-white/20"
            />
            在「在招广场」公开展示此岗位
          </label>

          {msg && (
            <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? '保存中…' : '保存岗位'}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
