'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { MathMatchResultView, type JdResumeMatchResultShape } from '@/components/math/MathMatchResultView';

type MatchResult = JdResumeMatchResultShape;

type ProgressUi = {
  title: string;
  percent: number;
  subtitle?: string;
};

function payloadToProgress(payload: Record<string, unknown>): ProgressUi | null {
  const phase = payload.phase as string;
  if (phase === 'ingest') {
    return { title: String(payload.message || '解析附件…'), percent: 8 };
  }
  if (phase === 'ingest_done') {
    const jd = Number(payload.jdChars) || 0;
    const rs = Number(payload.resumeChars) || 0;
    return {
      title: '附件解析完成',
      percent: 22,
      subtitle: `JD 约 ${jd} 字符 · 简历约 ${rs} 字符`,
    };
  }
  if (phase === 'github') {
    const pr = payload.progress as { percent?: number; stage?: string; detail?: string } | null | undefined;
    if (pr && typeof pr.percent === 'number') {
      return {
        title: '拉取 GitHub 公开画像',
        percent: 25 + Math.min(48, Math.round((pr.percent / 100) * 48)),
        subtitle: pr.detail || pr.stage,
      };
    }
    return {
      title: String(payload.message || '准备 GitHub 画像…'),
      percent: 28,
    };
  }
  if (phase === 'github_done') {
    return { title: 'GitHub 画像已就绪', percent: 74 };
  }
  if (phase === 'llm') {
    return { title: String(payload.message || 'LLM 对比分析…'), percent: 82 };
  }
  if (phase === 'done') {
    return { title: '分析完成', percent: 100 };
  }
  return null;
}

function FileHint() {
  return (
    <p className="text-[10px] text-slate-600 font-mono mt-1 leading-relaxed">
      支持 .txt / .md / .pdf / .docx / 常见图片（PNG、JPG 等）。多文件将按顺序拼接进正文。
    </p>
  );
}

/** GITLINK 首页「MATH」标签：JD / 简历 / GitHub 全方位匹配（原独立 /math 页） */
export function MathMatchPanel() {
  const router = useRouter();
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [jdFiles, setJdFiles] = useState<FileList | null>(null);
  const [resumeFiles, setResumeFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressUi | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ghHint, setGhHint] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  const runMatch = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent('/?tab=math')}`);
      return;
    }
    setErr(null);
    setGhHint(null);
    setResult(null);
    setProgress({ title: '正在连接…', percent: 2 });
    setLoading(true);
    let streamErr: string | null = null;
    let gotDone = false;
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
      await api.math.matchStream(fd, (payload) => {
        const phase = payload.phase as string;
        if (phase === 'error') {
          streamErr = String(payload.error || '匹配失败');
          const code = payload.code as string | undefined;
          if (code === 'GITHUB_FETCH_FAILED') {
            setGhHint('拉取 GitHub 公开数据失败：请检查登录名、仓库是否公开，或配置 GITHUB_TOKEN 后重试。');
          }
          setProgress(null);
          return;
        }
        if (phase === 'done') {
          gotDone = true;
          const r = payload.result as MatchResult | undefined;
          if (r) setResult(r);
          setProgress((prev) => (prev ? { title: '分析完成', percent: 100, subtitle: prev.subtitle } : null));
          return;
        }
        const ui = payloadToProgress(payload);
        if (ui) setProgress(ui);
      });
      if (streamErr) {
        setErr(streamErr);
      } else if (!gotDone) {
        setErr('连接意外结束，请重试');
      }
    } catch (e) {
      const msg = e instanceof APIError ? e.message : '匹配失败';
      setErr(msg);
      setProgress(null);
      if (e instanceof APIError && e.status === 502) {
        setGhHint('拉取 GitHub 公开数据失败：请检查登录名、仓库是否公开，或配置 GITHUB_TOKEN 后重试。');
      }
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(null), 1200);
    }
  }, [jdText, resumeText, githubUsername, jdFiles, resumeFiles, router]);

  return (
    <div className="w-full text-left pb-8">
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
          <h3 className="text-sm font-semibold text-violet-200 mb-3">左侧 · 职位 JD</h3>
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
          <h3 className="text-sm font-semibold text-cyan-200 mb-3">右侧 · 简历 + GitHub</h3>
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
            <label className="block text-[11px] font-mono text-slate-500 mb-1">GitHub 登录名（可选，拉取公开画像参与匹配）</label>
            <input
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-cyan-500/30"
              placeholder="例如 octocat（任意公开 GitHub 用户，服务端将自动拉取画像）"
            />
          </div>
        </section>
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runMatch()}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 px-6 py-3 text-sm font-semibold shadow-lg"
          >
            {loading ? '分析中…' : '开始全方位匹配'}
          </button>
          <p className="text-[10px] text-slate-600 max-w-md leading-relaxed">
            结果由大模型生成，仅供参考；涉密 JD/简历请勿上传至不可信环境。下方会显示解析附件、拉取 GitHub、LLM 对比等阶段进度。
          </p>
        </div>

        {progress && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 max-w-xl">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-slate-200">{progress.title}</p>
              <span className="text-xs font-mono text-violet-300 tabular-nums">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-[width] duration-500 ease-out"
                style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
              />
            </div>
            {progress.subtitle ? (
              <p className="text-[11px] text-slate-500 mt-2 font-mono line-clamp-2">{progress.subtitle}</p>
            ) : null}
          </div>
        )}
      </div>

      {result && (
        <div className="mt-10">
          <MathMatchResultView result={result} />
        </div>
      )}
    </div>
  );
}
