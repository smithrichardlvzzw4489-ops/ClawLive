'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import {
  api,
  APIError,
  type CodernetLinkSearchBuckets,
  type CodernetSearchProgress,
} from '@/lib/api';
import { withReturnTo } from '@/hooks/useHistoryBack';

const LINK_PHASE_STEPS = ['parsing', 'searching', 'enriching', 'ranking'] as const;

function linkPhaseStepIndex(phase: CodernetSearchProgress['phase']): number {
  if (phase === 'done') return LINK_PHASE_STEPS.length;
  if (phase === 'error') return 0;
  const i = LINK_PHASE_STEPS.indexOf(phase as (typeof LINK_PHASE_STEPS)[number]);
  return i >= 0 ? i : 0;
}

interface SemanticSearchHit {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  sharpCommentary: string;
  score: number;
  reason: string;
  stats: { totalPublicRepos: number; totalStars: number; followers: number };
  bio: string | null;
  location: string | null;
  hasJobSeekingIntent?: boolean;
  hasContact?: boolean;
  linkBucket?: string;
  siteUser?: { userId: string; username: string } | null;
}

const LINK_BUCKET_SECTIONS: { key: keyof CodernetLinkSearchBuckets; title: string; hint: string }[] = [
  {
    key: 'jobSeekingAndContact',
    title: '① 有求职意向且有联系方式',
    hint: '公开文案中含求职表述，且资料中有邮箱 / 主页 / X 等可触达线索',
  },
  {
    key: 'jobSeekingOnly',
    title: '② 仅有求职意向',
    hint: '有求职相关表述，但未发现明显公开联系方式',
  },
  {
    key: 'contactOnly',
    title: '③ 仅有联系方式',
    hint: '有邮箱或主页等，但未检测到典型求职表述',
  },
  {
    key: 'neither',
    title: '④ 无求职意向且无联系方式',
    hint: '其余候选人（仍可按匹配度排序）',
  },
];

export function CodernetLinkSearchPanel({ returnTo }: { returnTo: string }) {
  const [linkQuery, setLinkQuery] = useState('');
  const [linkFiles, setLinkFiles] = useState<File[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkResults, setLinkResults] = useState<SemanticSearchHit[] | null>(null);
  const [linkBuckets, setLinkBuckets] = useState<CodernetLinkSearchBuckets | null>(null);
  const [linkMeta, setLinkMeta] = useState<{
    mergedGithubCount?: number;
    withPublicContactCount?: number;
    enrichedCount?: number;
    deepEnrichCount?: number;
    metadataOnlyCount?: number;
  } | null>(null);
  const [linkProgress, setLinkProgress] = useState<CodernetSearchProgress | null>(null);

  const handleSemanticSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = linkQuery.trim();
    if ((!q && linkFiles.length === 0) || linkLoading) return;
    setLinkErr(null);
    setLinkProgress(null);
    setLinkLoading(true);
    setLinkResults(null);
    setLinkBuckets(null);
    setLinkMeta(null);
    try {
      const data = await api.codernet.searchDevelopers(
        q,
        linkFiles.length ? linkFiles : undefined,
        (p) => setLinkProgress(p),
      );
      setLinkResults((data.results ?? []) as SemanticSearchHit[]);
      setLinkBuckets(data.buckets ?? null);
      setLinkMeta(data.meta ?? null);
    } catch (err) {
      if (err instanceof APIError) {
        setLinkErr(err.message || '搜索失败');
      } else {
        setLinkErr('网络异常，请稍后重试');
      }
    } finally {
      setLinkLoading(false);
      setLinkProgress(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto w-full text-left">
              <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-6 sm:p-8 mb-6">
                <p className="text-center text-sm text-slate-400 mb-5 leading-relaxed">
                  用自然语言描述，和/或上传 JD、职位说明等附件（支持 .txt / .md / .pdf / .docx、常见图片）→ AI
                  综合解析并在 GitHub 上检索 → 精排后列出<strong className="text-slate-300">多位</strong>
                  合适开发者。
                </p>
                <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="text-lg font-bold text-green-400">多选</p>
                    <p className="text-[10px] text-slate-500 leading-tight">一次返回多人</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="text-lg font-bold text-violet-400">AI</p>
                    <p className="text-[10px] text-slate-500 leading-tight">解析 + 精排</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="text-lg font-bold text-blue-400">画像</p>
                    <p className="text-[10px] text-slate-500 leading-tight">跳转即看</p>
                  </div>
                </div>
                <form onSubmit={(e) => void handleSemanticSearch(e)} className="space-y-3">
                  <textarea
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    placeholder="例如：在上海做 Rust 后端、有开源贡献的开发者（可与下方附件同时使用）"
                    rows={3}
                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40 resize-y min-h-[5rem]"
                  />
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 font-mono">JD / 其他材料（可选，最多 8 个）</span>
                      {/* 勿用 display:none 隐藏 file input：部分浏览器选文件后 change 中 files 仍为空 */}
                      <label className="relative inline-flex min-h-[1.75rem] cursor-pointer items-center rounded-md px-1 text-xs font-mono text-violet-400 hover:text-violet-300">
                        <input
                          type="file"
                          multiple
                          accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          onChange={(e) => {
                            const picked = e.target.files;
                            const list = picked?.length ? Array.from(picked) : [];
                            e.target.value = '';
                            if (!list.length) return;
                            setLinkFiles((prev) => [...prev, ...list].slice(0, 8));
                          }}
                        />
                        <span className="pointer-events-none select-none">选择文件</span>
                      </label>
                    </div>
                    {linkFiles.length > 0 ? (
                      <ul className="text-[11px] text-slate-500 font-mono space-y-1">
                        {linkFiles.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setLinkFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="shrink-0 text-slate-600 hover:text-red-300"
                            >
                              移除
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
                        未选文件时仅按上方自然语言搜索；仅上传附件时也会按附件正文检索。
                      </p>
                    )}
                  </div>
                  {linkErr && (
                    <p className="text-xs text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">{linkErr}</p>
                  )}
                  {linkLoading && (
                    <div className="rounded-xl border border-violet-500/25 bg-black/25 px-4 py-3 space-y-2">
                      {linkProgress ? (
                        <>
                          <div className="flex items-start gap-2.5">
                            <span
                              className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-400 border-t-transparent"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-violet-100 leading-snug">{linkProgress.detail}</p>
                              {linkProgress.githubQuery ? (
                                <p
                                  className="text-[10px] font-mono text-slate-500 mt-1.5 truncate"
                                  title={linkProgress.githubQuery}
                                >
                                  检索式：{linkProgress.githubQuery}
                                </p>
                              ) : null}
                              {typeof linkProgress.totalFound === 'number' &&
                              (linkProgress.phase === 'searching' || linkProgress.phase === 'enriching') ? (
                                <p className="text-[10px] text-slate-500 mt-1">
                                  本轮 GitHub 候选：{linkProgress.totalFound} 人
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width] duration-500 ease-out"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round(
                                    ((linkPhaseStepIndex(linkProgress.phase) + 1) / (LINK_PHASE_STEPS.length + 1)) *
                                      100,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono text-slate-500">
                            {(
                              [
                                ['parsing', '解析需求'],
                                ['searching', 'GitHub 检索'],
                                ['enriching', '资料分析'],
                                ['ranking', 'AI 精排'],
                              ] as const
                            ).map(([key, label]) => {
                              const stepIdx = LINK_PHASE_STEPS.indexOf(key);
                              const cur = linkPhaseStepIndex(linkProgress.phase);
                              const done = cur > stepIdx;
                              const active = cur === stepIdx && linkProgress.phase !== 'done';
                              return (
                                <li
                                  key={key}
                                  className={`rounded-md px-2 py-1.5 text-center border ${
                                    active
                                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                                      : done
                                        ? 'border-white/[0.06] text-slate-500'
                                        : 'border-white/[0.04] text-slate-600'
                                  }`}
                                >
                                  <span className="mr-0.5">{done ? '✓' : active ? '›' : '○'}</span>
                                  {label}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                          正在上传请求并连接服务器…
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={linkLoading || (!linkQuery.trim() && linkFiles.length === 0)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 text-sm font-semibold transition"
                  >
                    {linkLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        搜索中…
                      </>
                    ) : (
                      '搜索'
                    )}
                  </button>
                </form>
              </div>

              {linkResults && linkResults.length === 0 && !linkLoading && (
                <p className="text-center text-sm text-slate-500 mb-6">未找到足够匹配的开发者，可换个描述再试。</p>
              )}

              {linkResults && linkResults.length > 0 && (
                <div className="space-y-8 mb-8">
                  <p className="text-xs text-slate-500 font-mono text-center mb-1">
                    共 {linkResults.length} 人
                    {linkMeta?.mergedGithubCount != null && linkMeta?.enrichedCount != null
                      ? (linkMeta.deepEnrichCount ?? 0) > 0 && (linkMeta.metadataOnlyCount ?? 0) > 0
                        ? ` · GitHub 合并 ${linkMeta.mergedGithubCount} → 深度 ${linkMeta.deepEnrichCount} · 仅摘要 ${linkMeta.metadataOnlyCount}`
                        : (linkMeta.deepEnrichCount ?? 0) === 0
                          ? ` · GitHub 合并 ${linkMeta.mergedGithubCount}${
                              linkMeta.withPublicContactCount != null
                                ? ` · 含可触达线索 ${linkMeta.withPublicContactCount}`
                                : ''
                            } · 按四类公开分桶（无深度画像/精排）`
                          : ` · GitHub 合并 ${linkMeta.mergedGithubCount} → 全量分析 ${linkMeta.enrichedCount}`
                      : ''}
                    · 点击卡片查看画像
                  </p>
                  {linkBuckets
                    ? LINK_BUCKET_SECTIONS.map(({ key, title, hint }) => {
                        const list = (linkBuckets[key] ?? []) as SemanticSearchHit[];
                        if (!list.length) return null;
                        return (
                          <div key={key} className="space-y-2">
                            <div className="text-left border-b border-white/[0.08] pb-2">
                              <h3 className="text-sm font-semibold text-white">{title}</h3>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{hint}</p>
                              <p className="text-[10px] font-mono text-violet-400/80 mt-1">{list.length} 人</p>
                            </div>
                            <div className="space-y-3">
                              {list.map((hit) => (
                                <div
                                  key={`${key}-${hit.githubUsername}`}
                                  className="flex gap-2 sm:gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 sm:p-4 transition hover:border-violet-500/20 hover:bg-white/[0.04]"
                                >
                                  <Link
                                    href={withReturnTo(
                                      `/codernet/github/${encodeURIComponent(hit.githubUsername)}`,
                                      returnTo,
                                    )}
                                    className="flex gap-3 flex-1 min-w-0"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={hit.avatarUrl}
                                      alt=""
                                      className="h-14 w-14 shrink-0 rounded-lg border border-white/10"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-baseline gap-2">
                                        <span className="font-mono font-semibold text-white">@{hit.githubUsername}</span>
                                        <span className="text-[10px] text-violet-400 font-mono">
                                          匹配 {(hit.score * 100).toFixed(0)}%
                                        </span>
                                        {hit.hasJobSeekingIntent ? (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                            求职
                                          </span>
                                        ) : null}
                                        {hit.hasContact ? (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25">
                                            联系方式
                                          </span>
                                        ) : null}
                                      </div>
                                      {hit.oneLiner ? (
                                        <p className="text-xs text-violet-200/90 mt-1 line-clamp-2">{hit.oneLiner}</p>
                                      ) : null}
                                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{hit.reason}</p>
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {hit.techTags.slice(0, 6).map((t) => (
                                          <span
                                            key={t}
                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400"
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                      <p className="text-[10px] text-slate-600 mt-2 font-mono">
                                        {hit.stats.followers.toLocaleString()} followers · {hit.stats.totalPublicRepos}{' '}
                                        repos
                                        {hit.location ? ` · ${hit.location}` : ''}
                                      </p>
                                    </div>
                                  </Link>
                                  <div className="flex flex-col items-end justify-center gap-2 shrink-0">
                                    {hit.siteUser ? (
                                      <Link
                                        href={`/messages/new?to=${encodeURIComponent(hit.siteUser.username)}`}
                                        className="text-[11px] font-medium rounded-lg bg-cyan-600/25 text-cyan-100 px-2.5 py-1.5 border border-cyan-500/35 hover:bg-cyan-600/40 whitespace-nowrap"
                                      >
                                        站内信
                                      </Link>
                                    ) : null}
                                    <span className="text-violet-400 text-sm hidden sm:block">→</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    : null}
                  {!linkBuckets &&
                    linkResults.map((hit) => (
                      <div
                        key={hit.githubUsername}
                        className="flex gap-2 sm:gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 sm:p-4 transition hover:border-violet-500/20 hover:bg-white/[0.04]"
                      >
                        <Link
                          href={withReturnTo(`/codernet/github/${encodeURIComponent(hit.githubUsername)}`, returnTo)}
                          className="flex gap-3 flex-1 min-w-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={hit.avatarUrl}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg border border-white/10"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-mono font-semibold text-white">@{hit.githubUsername}</span>
                              <span className="text-[10px] text-violet-400 font-mono">
                                匹配 {(hit.score * 100).toFixed(0)}%
                              </span>
                            </div>
                            {hit.oneLiner ? (
                              <p className="text-xs text-violet-200/90 mt-1 line-clamp-2">{hit.oneLiner}</p>
                            ) : null}
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{hit.reason}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {hit.techTags.slice(0, 6).map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2 font-mono">
                              {hit.stats.followers.toLocaleString()} followers · {hit.stats.totalPublicRepos} repos
                              {hit.location ? ` · ${hit.location}` : ''}
                            </p>
                          </div>
                        </Link>
                        <div className="flex flex-col items-end justify-center gap-2 shrink-0">
                          {hit.siteUser ? (
                            <Link
                              href={`/messages/new?to=${encodeURIComponent(hit.siteUser.username)}`}
                              className="text-[11px] font-medium rounded-lg bg-cyan-600/25 text-cyan-100 px-2.5 py-1.5 border border-cyan-500/35 hover:bg-cyan-600/40 whitespace-nowrap"
                            >
                              站内信
                            </Link>
                          ) : null}
                          <span className="text-violet-400 text-sm hidden sm:block">→</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
  );
}

