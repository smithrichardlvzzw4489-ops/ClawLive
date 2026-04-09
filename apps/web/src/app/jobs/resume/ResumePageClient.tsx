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

export function ResumePageClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState('');
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
      router.replace('/login?redirect=/jobs/resume');
      return;
    }
    setReady(true);
    (async () => {
      try {
        const d = (await api.jobA2A.dashboard()) as {
          seekerProfile: {
            title: string;
            city: string | null;
            salaryMin: number | null;
            salaryMax: number | null;
            skills: unknown;
            narrative: string;
            active: boolean;
          } | null;
        };
        const p = d.seekerProfile;
        if (p) {
          setTitle(p.title);
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
    if (!title.trim()) {
      setMsg({ ok: false, text: '请填写求职意向标题（如：资深前端 / 全栈）' });
      return;
    }
    setBusy(true);
    try {
      await api.jobA2A.saveSeeker({
        title: title.trim(),
        city: city.trim() || undefined,
        salaryMin: salaryMin.trim() ? Number(salaryMin) : undefined,
        salaryMax: salaryMax.trim() ? Number(salaryMax) : undefined,
        skills: parseSkills(skills),
        narrative: narrative.trim(),
        active: publicVisible,
      });
      setMsg({ ok: true, text: '简历已保存。可前往在招广场查看公开展示效果。' });
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof APIError ? e.message : '保存失败',
      });
    } finally {
      setBusy(false);
    }
  }, [title, city, salaryMin, salaryMax, skills, narrative, publicVisible]);

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
          <Link href="/jobs" className="text-sm text-slate-500 hover:text-emerald-400">
            ← 在招广场
          </Link>
          <h1 className="mt-4 text-2xl font-bold">我的简历</h1>
          <p className="mt-1 text-sm text-slate-500">
            面向求职者：补充意向与经历摘要，用于广场展示与 A2A 匹配；技术细节可同步维护{' '}
            <Link href="/codernet" className="text-sky-400 hover:underline">
              GITLINK 画像
            </Link>
            。
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm">
          <label className="block">
            <span className="text-xs text-slate-500">求职意向 / 头衔 *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="如：后端开发 · 云原生方向"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">期望城市</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="如：北京 / 远程"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">期望月薪下限（元）</span>
              <input
                type="number"
                min={0}
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">期望月薪上限（元）</span>
              <input
                type="number"
                min={0}
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-500">技能关键词（逗号分隔）</span>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono text-white outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">经历与亮点摘要</span>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={8}
              className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="工作年限、代表项目、开源、论文等（无需写身份证号等敏感信息）"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={publicVisible}
              onChange={(e) => setPublicVisible(e.target.checked)}
              className="rounded border-white/20"
            />
            在「在招广场」公开此简历摘要
          </label>

          {msg && (
            <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? '保存中…' : '保存简历'}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
