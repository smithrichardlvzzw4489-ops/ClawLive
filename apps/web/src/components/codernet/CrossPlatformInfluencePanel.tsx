'use client';

import { useCallback, useEffect, useState } from 'react';

/** 与服务端 CodernetAnalysis.multiPlatformInsights 对齐（用于展示分项依据） */
export type InfluenceInsightsPayload = {
  stackOverflowReputation?: number;
  stackOverflowTopTags?: string[];
  npmPackageCount?: number;
  npmTotalWeeklyDownloads?: number;
  pypiPackageCount?: number;
  devtoArticleCount?: number;
  devtoTotalReactions?: number;
  hfModelCount?: number;
  hfDatasetCount?: number;
  hfSpaceCount?: number;
  hfTotalDownloads?: number;
  hfTopPipelineTags?: string[];
  gitlabProjects?: number;
  leetcodeSolved?: number;
  leetcodeRating?: number | null;
  kaggleTier?: string;
  kaggleMedals?: number;
  codeforcesRating?: number;
  codeforcesRank?: string;
  dockerPulls?: number;
  cratesCount?: number;
  cratesTotalDownloads?: number;
  communityInfluenceScore?: number;
  knowledgeSharingScore?: number;
  packageImpactScore?: number;
  aiMlImpactScore?: number;
  algorithmScore?: number;
};

/** 与 lookup 返回的 multiPlatform 子集对齐，均为可选 */
export type InfluenceMultiPlatformPayload = {
  stackOverflow?: { profileUrl: string; reputation?: number; answerCount?: number } | null;
  npmPackages?: Array<{ name: string; weeklyDownloads: number }>;
  pypiPackages?: Array<{ name: string; projectUrl: string }>;
  devto?: {
    username: string;
    articlesCount: number;
    totalReactions: number;
    topArticles?: Array<{ title: string; url: string }>;
  } | null;
  huggingface?: {
    profileUrl: string;
    models: Array<{ modelId: string; downloads: number }>;
    datasets: Array<{ id: string; downloads: number }>;
    spaces: Array<{ id: string }>;
    totalDownloads: number;
    topPipelineTags: string[];
  } | null;
  leetcode?: {
    profileUrl: string;
    totalSolved: number;
    hardSolved: number;
    contestRating: number | null;
  } | null;
  codeforces?: { profileUrl: string; rating: number; rank: string } | null;
  kaggle?: {
    profileUrl: string;
    tier: string;
    goldMedals: number;
    silverMedals: number;
    bronzeMedals: number;
  } | null;
  dockerhub?: { profileUrl: string; repositories: Array<{ name: string; pullCount: number }>; totalPulls: number } | null;
  cratesio?: {
    profileUrl: string;
    crates: Array<{ name: string; downloads: number }>;
    totalDownloads: number;
    totalCrates: number;
  } | null;
} | null | undefined;

export type InfluenceDimension = 'community' | 'ai_ml' | 'algorithm' | 'knowledge' | 'package';

function nonGitHubPlatforms(platformsUsed?: string[]): string[] {
  if (!platformsUsed?.length) return [];
  return platformsUsed.filter((p) => p !== 'GitHub');
}

function detailForDimension(
  dim: InfluenceDimension,
  ins: InfluenceInsightsPayload,
  mp: InfluenceMultiPlatformPayload,
  platformsUsed?: string[],
): { title: string; intro: string; bullets: string[]; links: Array<{ href: string; label: string }> } {
  const links: Array<{ href: string; label: string }> = [];
  const bullets: string[] = [];

  const k = ins.knowledgeSharingScore ?? 0;
  const p = ins.packageImpactScore ?? 0;
  const a = ins.aiMlImpactScore ?? 0;
  const alg = ins.algorithmScore ?? 0;
  const extra = Math.max(0, nonGitHubPlatforms(platformsUsed).length);

  if (dim === 'community') {
    const title = 'Community';
    const intro =
      '综合分（0–100）由 GITLINK 将知识、包、AI/ML、算法四项子分与「除 GitHub 外已连接平台数」加权合成，与后端 analyzeGitHubProfile 一致。';
    bullets.push(
      `公式（概念）：Knowledge×0.25 + Package×0.25 + AI/ML×0.2 + Algorithm×0.15 + (非 GitHub 平台数)×2.5，再截断到 100。`,
    );
    bullets.push(`当前子分：Knowledge ${k} · Package ${p} · AI/ML ${a} · Algorithm ${alg}。`);
    bullets.push(`非 GitHub 平台数：${extra}（${nonGitHubPlatforms(platformsUsed).join('、') || '无'}）。`);
    bullets.push(`本卡片展示分：${ins.communityInfluenceScore ?? '—'}。`);
    return { title, intro, bullets, links };
  }

  if (dim === 'knowledge') {
    const title = 'Knowledge';
    const intro = '来自 Stack Overflow 声望（log 映射）与 DEV.to 文章数的加成。';
    if (ins.stackOverflowReputation != null) {
      bullets.push(`Stack Overflow 声望：${ins.stackOverflowReputation.toLocaleString()}。`);
      if (ins.stackOverflowTopTags?.length) {
        bullets.push(`擅长标签（样本）：${ins.stackOverflowTopTags.slice(0, 12).join('、')}。`);
      }
      if (mp?.stackOverflow?.profileUrl) links.push({ href: mp.stackOverflow.profileUrl, label: 'Stack Overflow 主页' });
    } else bullets.push('未在画像中写入 Stack Overflow 声望（可能未匹配到账号或数据缺失）。');
    if (ins.devtoArticleCount != null) {
      bullets.push(`DEV.to 文章数：${ins.devtoArticleCount}；总反应数：${ins.devtoTotalReactions ?? 0}。`);
      if (mp?.devto?.topArticles?.length) {
        mp.devto.topArticles.slice(0, 5).forEach((art) => {
          bullets.push(`文章：${art.title}`);
          if (art.url) links.push({ href: art.url, label: `DEV: ${art.title.slice(0, 40)}${art.title.length > 40 ? '…' : ''}` });
        });
      }
    }
    bullets.push(`Knowledge 得分：${ins.knowledgeSharingScore ?? '—'}。`);
    return { title, intro, bullets, links };
  }

  if (dim === 'package') {
    const title = 'Package';
    const intro = '综合 npm 周下载（log 映射）、PyPI 包量、Docker Hub 拉取、crates.io 下载等信号。';
    if (ins.npmPackageCount != null) {
      bullets.push(`npm 包数量：${ins.npmPackageCount}；估算周下载合计：${(ins.npmTotalWeeklyDownloads ?? 0).toLocaleString()}。`);
      if (mp?.npmPackages?.length) {
        mp.npmPackages.slice(0, 8).forEach((pkg) => {
          bullets.push(`npm · ${pkg.name} — 周下载约 ${pkg.weeklyDownloads.toLocaleString()}`);
          links.push({
            href: `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`,
            label: `npm: ${pkg.name}`,
          });
        });
      }
    }
    if (ins.pypiPackageCount != null && ins.pypiPackageCount > 0) {
      bullets.push(`PyPI 包数量：${ins.pypiPackageCount}。`);
      mp?.pypiPackages?.slice(0, 6).forEach((pkg) => {
        if (pkg.projectUrl) links.push({ href: pkg.projectUrl, label: `PyPI: ${pkg.name}` });
      });
    }
    if (ins.dockerPulls != null && ins.dockerPulls > 0) {
      bullets.push(`Docker Hub 总拉取（估算）：${ins.dockerPulls.toLocaleString()}。`);
      if (mp?.dockerhub?.profileUrl) links.push({ href: mp.dockerhub.profileUrl, label: 'Docker Hub 主页' });
    }
    if (ins.cratesCount != null && ins.cratesCount > 0) {
      bullets.push(`crates.io：${ins.cratesCount} 个 crate；总下载约 ${(ins.cratesTotalDownloads ?? 0).toLocaleString()}。`);
      if (mp?.cratesio?.profileUrl) links.push({ href: mp.cratesio.profileUrl, label: 'crates.io 主页' });
    }
    bullets.push(`Package 得分：${ins.packageImpactScore ?? '—'}。`);
    return { title, intro, bullets, links };
  }

  if (dim === 'ai_ml') {
    const title = 'AI/ML';
    const intro = '来自 Hugging Face 模型/数据集/Space 与下载量，以及 Kaggle 奖牌加成。';
    if (
      ins.hfModelCount != null ||
      ins.hfDatasetCount != null ||
      ins.hfSpaceCount != null ||
      (ins.hfTotalDownloads ?? 0) > 0
    ) {
      bullets.push(
        `Hugging Face：模型 ${ins.hfModelCount ?? 0} · 数据集 ${ins.hfDatasetCount ?? 0} · Space ${ins.hfSpaceCount ?? 0} · 下载量合计约 ${(ins.hfTotalDownloads ?? 0).toLocaleString()}。`,
      );
      if (ins.hfTopPipelineTags?.length) bullets.push(`Pipeline 标签（样本）：${ins.hfTopPipelineTags.slice(0, 10).join('、')}。`);
      if (mp?.huggingface?.profileUrl) links.push({ href: mp.huggingface.profileUrl, label: 'Hugging Face 主页' });
    } else bullets.push('未写入 Hugging Face 统计（可能未匹配）。');
    if (ins.kaggleTier || (ins.kaggleMedals ?? 0) > 0) {
      bullets.push(`Kaggle：段位 ${ins.kaggleTier ?? '—'}；奖牌合计 ${ins.kaggleMedals ?? 0}。`);
      if (mp?.kaggle?.profileUrl) links.push({ href: mp.kaggle.profileUrl, label: 'Kaggle 主页' });
    }
    bullets.push(`AI/ML 得分：${ins.aiMlImpactScore ?? '—'}。`);
    return { title, intro, bullets, links };
  }

  const title = 'Algorithm';
  const intro = '来自 LeetCode 解题数/难度与比赛分，及 Codeforces 积分加成。';
  if (ins.leetcodeSolved != null || ins.leetcodeRating != null) {
    bullets.push(
      `LeetCode：解题 ${ins.leetcodeSolved ?? '—'}；比赛分约 ${ins.leetcodeRating ?? '—'}。`,
    );
    if (mp?.leetcode) {
      bullets.push(`LeetCode 困难题（爬虫）：${mp.leetcode.hardSolved}。`);
      if (mp.leetcode.profileUrl) links.push({ href: mp.leetcode.profileUrl, label: 'LeetCode 主页' });
    }
  } else bullets.push('未写入 LeetCode 统计。');
  if (ins.codeforcesRating != null) {
    bullets.push(`Codeforces：积分 ${ins.codeforcesRating}（${ins.codeforcesRank ?? 'rank —'}）。`);
    if (mp?.codeforces?.profileUrl) links.push({ href: mp.codeforces.profileUrl, label: 'Codeforces 主页' });
  }
  bullets.push(`Algorithm 得分：${ins.algorithmScore ?? '—'}。`);
  return { title, intro, bullets, links };
}

function InfluenceRow({
  label,
  score,
  color,
  onOpen,
}: {
  label: string;
  score: number;
  color: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-2 rounded-lg py-1.5 px-2 -mx-2 text-left transition hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
    >
      <span className="text-[10px] text-slate-500 font-mono w-20 shrink-0 group-hover:text-slate-400">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono font-bold w-6 text-right shrink-0" style={{ color }}>
        {score}
      </span>
      <span className="text-[9px] text-slate-600 font-mono shrink-0 w-4 text-center" aria-hidden>
        →
      </span>
    </button>
  );
}

export function CrossPlatformInfluencePanel({
  insights,
  multiPlatform,
  platformsUsed,
}: {
  insights: InfluenceInsightsPayload;
  multiPlatform?: InfluenceMultiPlatformPayload;
  platformsUsed?: string[];
}) {
  const [open, setOpen] = useState<InfluenceDimension | null>(null);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const modalBody = open ? detailForDimension(open, insights, multiPlatform, platformsUsed) : null;

  return (
    <>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm mb-6">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-mono">Cross-Platform Influence</h3>
        <p className="text-[10px] text-slate-600 font-mono mb-4">点击各行查看分项依据与外链</p>
        <div className="space-y-1">
          {insights.communityInfluenceScore != null && (
            <InfluenceRow
              label="Community"
              score={insights.communityInfluenceScore}
              color="#8b5cf6"
              onOpen={() => setOpen('community')}
            />
          )}
          {insights.aiMlImpactScore != null && (
            <InfluenceRow label="AI/ML" score={insights.aiMlImpactScore} color="#ffcc00" onOpen={() => setOpen('ai_ml')} />
          )}
          {insights.algorithmScore != null && (
            <InfluenceRow label="Algorithm" score={insights.algorithmScore} color="#ffa116" onOpen={() => setOpen('algorithm')} />
          )}
          {insights.knowledgeSharingScore != null && (
            <InfluenceRow
              label="Knowledge"
              score={insights.knowledgeSharingScore}
              color="#f48024"
              onOpen={() => setOpen('knowledge')}
            />
          )}
          {insights.packageImpactScore != null && (
            <InfluenceRow label="Package" score={insights.packageImpactScore} color="#cb3837" onOpen={() => setOpen('package')} />
          )}
        </div>
      </div>

      {open && modalBody && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="influence-detail-title"
            className="w-full max-w-lg max-h-[min(85vh,32rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#0c101c] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h4 id="influence-detail-title" className="text-sm font-bold text-white font-mono">
                  {modalBody.title}
                </h4>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{modalBody.intro}</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white/10 hover:text-white font-mono"
              >
                关闭
              </button>
            </div>
            <ul className="space-y-2 mb-4">
              {modalBody.bullets.map((line, i) => (
                <li key={i} className="text-xs text-slate-300 leading-relaxed pl-3 border-l border-white/[0.08]">
                  {line}
                </li>
              ))}
            </ul>
            {modalBody.links.length > 0 && (
              <div className="pt-3 border-t border-white/[0.08]">
                <p className="text-[10px] font-mono text-slate-500 mb-2">相关链接</p>
                <div className="flex flex-col gap-1.5">
                  {[...new Map(modalBody.links.map((l) => [l.href, l])).values()].slice(0, 12).map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-400 hover:underline font-mono truncate"
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
