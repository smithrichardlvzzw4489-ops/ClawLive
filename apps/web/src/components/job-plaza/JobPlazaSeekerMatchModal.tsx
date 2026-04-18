'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, APIError } from '@/lib/api';
import { MathMatchResultView, type JdResumeMatchResultShape } from '@/components/math/MathMatchResultView';

export type SeekerTagPreview = {
  tagMatchPercent: number;
  rawTagScore: number;
  maxTagScore: number;
  tagLines: Array<{ jobTag: string; bodyHit: boolean; userMatch?: string; points: number }>;
  hasMaterials: boolean;
  userTagCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  jobId: string | null;
  jobTitle: string;
  preview: SeekerTagPreview | undefined;
  onMathSaved?: (jobId: string, overall: number) => void;
};

const MATH_CACHE_PREFIX = 'clawlive-job-plaza-math:';

function readMathCache(jobId: string): JdResumeMatchResultShape | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MATH_CACHE_PREFIX + jobId);
    if (!raw) return null;
    return JSON.parse(raw) as JdResumeMatchResultShape;
  } catch {
    return null;
  }
}

function writeMathCache(jobId: string, result: JdResumeMatchResultShape) {
  try {
    sessionStorage.setItem(MATH_CACHE_PREFIX + jobId, JSON.stringify(result));
  } catch {
    /* ignore */
  }
}

export function JobPlazaSeekerMatchModal({
  open,
  onClose,
  jobId,
  jobTitle,
  preview,
  onMathSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mathResult, setMathResult] = useState<JdResumeMatchResultShape | null>(null);

  useEffect(() => {
    if (!open || !jobId) {
      setMathResult(null);
      setErr(null);
      setLoading(false);
      return;
    }
    setMathResult(readMathCache(jobId));
    setErr(null);
  }, [open, jobId]);

  const runMath = useCallback(async () => {
    if (!jobId) return;
    setErr(null);
    setLoading(true);
    try {
      const data = await api.jobPlaza.mathMatch(jobId);
      const r = data.result as JdResumeMatchResultShape | undefined;
      if (!r) {
        setErr('未返回分析结果');
        return;
      }
      setMathResult(r);
      writeMathCache(jobId, r);
      onMathSaved?.(jobId, r.overallMatch);
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '分析失败');
    } finally {
      setLoading(false);
    }
  }, [jobId, onMathSaved]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-match-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl max-h-[min(90vh,720px)] overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#0c0c12] shadow-2xl text-left">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-white/[0.08] bg-[#0c0c12]/95 backdrop-blur px-5 py-4">
          <div className="min-w-0">
            <h2 id="job-match-title" className="text-base font-semibold text-white truncate">
              职位匹配度
            </h2>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{jobTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/[0.06]"
          >
            关闭
          </button>
        </div>

        <div className="px-5 py-5 space-y-8 text-slate-200">
          {err ? (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</div>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold text-slate-100 mb-2">画像标签 × JD（与站内通知同一套规则）</h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              按 JD 的「匹配标签」与您的画像技术标签、以及 JD 正文关键词重叠计分；用于列表上的快速预估，不产生 MATH 额度消耗。
            </p>
            {preview ? (
              <>
                <div className="flex flex-wrap items-baseline gap-3 mb-4">
                  <span className="text-3xl font-black text-cyan-400 tabular-nums">{preview.tagMatchPercent}</span>
                  <span className="text-xs text-slate-500">/ 100 · 标签预估</span>
                  <span className="text-[10px] text-slate-600 font-mono">
                    raw {preview.rawTagScore}/{preview.maxTagScore} · 画像标签 {preview.userTagCount} 个
                  </span>
                </div>
                <ul className="space-y-2 text-xs">
                  {preview.tagLines.length === 0 ? (
                    <li className="text-slate-500">该职位暂无匹配标签。</li>
                  ) : (
                    preview.tagLines.map((row) => (
                      <li
                        key={row.jobTag}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex flex-wrap gap-x-3 gap-y-1"
                      >
                        <span className="font-mono text-violet-300/90">{row.jobTag}</span>
                        <span className="text-slate-500">
                          {row.bodyHit ? 'JD正文命中' : '正文未命中'}
                          {row.userMatch ? ` · 画像≈「${row.userMatch}」` : ' · 画像未命中'}
                        </span>
                        <span className="text-slate-600 ml-auto tabular-nums">+{row.points}</span>
                      </li>
                    ))
                  )}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate-500">暂无预估数据。</p>
            )}
          </section>

          <section className="border-t border-white/[0.08] pt-6">
            <h3 className="text-sm font-semibold text-violet-200 mb-2">MATH 完整分析</h3>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              与首页「MATH」标签相同：由大模型阅读完整 JD 与您的<strong className="text-slate-400">个人简历</strong>及
              <strong className="text-slate-400"> GitHub 公开画像</strong>，输出分项与综合匹配度；消耗同一类「Math 匹配」月度额度。
            </p>
            {!preview?.hasMaterials ? (
              <p className="text-xs text-amber-200/90 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                请先在个人资料中填写「个人简历」或绑定 GitHub，再运行 MATH 分析。
                <Link href="/my/profile" className="ml-1 text-violet-300 underline">
                  去完善资料
                </Link>
              </p>
            ) : null}
            <button
              type="button"
              disabled={loading || !preview?.hasMaterials}
              onClick={() => void runMath()}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-45 px-5 py-2.5 text-sm font-semibold shadow-lg"
            >
              {loading ? '分析中…' : mathResult ? '重新运行 MATH 分析' : '开始 MATH 分析'}
            </button>
            {mathResult ? <MathMatchResultView result={mathResult} /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
