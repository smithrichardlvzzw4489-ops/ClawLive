'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

type MatchResult = {
  jdItemMatches: Array<{
    id: string;
    title: string;
    matchScore: number;
    rationale: string;
    gap?: string;
  }>;
  overallMatch: number;
  executiveSummary: string;
  notes?: string;
};

function FileHint() {
  return (
    <p className="text-[10px] text-slate-600 font-mono mt-1 leading-relaxed">
      支持 .txt / .md / .pdf / .docx / 常见图片（PNG、JPG 等）。多文件将按顺序拼接进正文。
    </p>
  );
}

export default function MathPage() {
  const router = useRouter();
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [jdFiles, setJdFiles] = useState<FileList | null>(null);
  const [resumeFiles, setResumeFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ghHint, setGhHint] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  const runMatch = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/login?redirect=/math');
      return;
    }
    setErr(null);
    setGhHint(null);
    setResult(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set('jdText', jdText);
      fd.set('resumeText', resumeText);
      fd.set('githubUsername', githubUsername.trim());
      if (jdFiles) {
        for (let i = 0; i < jdFiles.length; i++) fd.append('jdFiles', jdFiles[i]);
      }
      if (resumeFiles) {
        for (let i = 0; i < resumeFiles.length; i++) fd.append('resumeFiles', resumeFiles[i]);
      }
      const data = await api.math.match(fd);
      setResult(data.result);
    } catch (e) {
      const msg = e instanceof APIError ? e.message : '匹配失败';
      setErr(msg);
      if (e instanceof APIError && e.status === 502) {
        setGhHint('拉取 GitHub 公开数据失败：请检查登录名、仓库是否公开，或配置 GITHUB_TOKEN 后重试。');
      }
    } finally {
      setLoading(false);
    }
  }, [jdText, resumeText, githubUsername, jdFiles, resumeFiles, router]);

  return (
    <MainLayout flatBackground>
      <div className="min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Math</h1>
              <p className="text-xs text-slate-500 mt-2 max-w-xl leading-relaxed">
                左侧粘贴或导入<strong className="text-slate-400">职位 JD</strong>，右侧粘贴或导入
                <strong className="text-slate-400">简历</strong>并可选填 <strong className="text-slate-400">GitHub</strong>
                登录名以自动拉取<strong className="text-slate-400">公开 GitHub 画像</strong>（无需事先在站内打开过该用户）。首次拉取可能需 1～3
                分钟。LLM 将按 JD 条目给出匹配度与
                <strong className="text-slate-400">综合匹配度</strong>（需登录，消耗每月 Math 配额）。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <Link href="/codernet" className="text-violet-400 hover:text-violet-300">
                GITLINK 首页
              </Link>
              <span className="text-slate-600">·</span>
              <Link href="/job-plaza" className="text-violet-400 hover:text-violet-300">
                招聘广场
              </Link>
            </div>
          </div>

          {ghHint && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/95">
              {ghHint}
            </div>
          )}

          {err && (
            <p className="text-sm text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-4">{err}</p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h2 className="text-sm font-semibold text-violet-200 mb-3">左侧 · 职位 JD</h2>
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={14}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-violet-500/40 resize-y min-h-[200px]"
                placeholder="粘贴完整 JD，或通过下方上传 PDF / Word / 图片…"
              />
              <label className="mt-3 block text-[11px] font-mono text-slate-500">
                导入文件（可多选）
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.pdf,.docx,image/*"
                  className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-violet-600 file:px-2 file:py-1 file:text-white"
                  onChange={(e) => setJdFiles(e.target.files)}
                />
                <FileHint />
              </label>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h2 className="text-sm font-semibold text-cyan-200 mb-3">右侧 · 简历 + GitHub</h2>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={11}
                className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/30 resize-y min-h-[180px]"
                placeholder="粘贴简历正文…"
              />
              <label className="mt-3 block text-[11px] font-mono text-slate-500">
                导入简历文件（可多选）
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.pdf,.docx,image/*"
                  className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-cyan-700 file:px-2 file:py-1 file:text-white"
                  onChange={(e) => setResumeFiles(e.target.files)}
                />
                <FileHint />
              </label>
              <div className="mt-4">
                <label className="block text-[11px] font-mono text-slate-500 mb-1">GitHub 登录名（可选，用于合并 GITLINK 画像）</label>
                <input
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-cyan-500/30"
                  placeholder="例如 octocat（任意公开 GitHub 用户，服务端将自动拉取画像）"
                />
              </div>
            </section>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runMatch()}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 px-6 py-3 text-sm font-semibold shadow-lg"
            >
              {loading ? '分析中…' : '开始全方位匹配'}
            </button>
            <p className="text-[10px] text-slate-600 max-w-md leading-relaxed">
              结果由大模型生成，仅供参考；涉密 JD/简历请勿上传至不可信环境。首次填写某 GitHub 时拉取公开数据可能较慢，请耐心等待。
            </p>
          </div>

          {result && (
            <div className="mt-10 space-y-6">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-6">
                <p className="text-[11px] font-mono text-slate-500 mb-1">综合匹配度</p>
                <p className="text-4xl font-black text-emerald-400 tabular-nums">{result.overallMatch}</p>
                <p className="text-sm text-slate-300 mt-4 whitespace-pre-wrap leading-relaxed">{result.executiveSummary}</p>
                {result.notes ? (
                  <p className="text-xs text-slate-500 mt-3 border-t border-white/10 pt-3">{result.notes}</p>
                ) : null}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-3">JD 分项匹配</h3>
                <ul className="space-y-3">
                  {result.jdItemMatches.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex flex-wrap gap-3 items-start"
                    >
                      <div className="shrink-0 w-14 text-center">
                        <span className="text-lg font-bold text-violet-300 tabular-nums">{row.matchScore}</span>
                        <span className="block text-[9px] text-slate-600 font-mono">/100</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{row.title}</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{row.rationale}</p>
                        {row.gap ? <p className="text-xs text-amber-400/90 mt-2">缺口：{row.gap}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
