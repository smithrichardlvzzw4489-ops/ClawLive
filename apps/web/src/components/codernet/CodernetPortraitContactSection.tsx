'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

function twitterFromBio(bio: string | null | undefined): { href: string; label: string } | null {
  if (!bio) return null;
  const m = bio.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]{1,30})/i);
  if (m?.[1]) return twitterUrlFromHandle(m[1]);
  const m2 = bio.match(/(?:^|\s)@([a-zA-Z0-9_]{1,30})(?:\s|$)/);
  if (m2?.[1] && m2[1].length > 2) return twitterUrlFromHandle(m2[1]);
  return null;
}

function normalizeHttpUrl(raw: string | null | undefined): { href: string; label: string } | null {
  const s = raw?.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return { href: s, label: s };
  if (/^mailto:/i.test(s)) return { href: s, label: s.replace(/^mailto:/i, '') };
  if (s.includes('.') && !s.includes(' ')) return { href: `https://${s}`, label: `https://${s}` };
  return { href: s, label: s };
}

function twitterUrlFromHandle(h: string | null | undefined): { href: string; label: string } | null {
  const x = h?.replace(/^@/, '').trim();
  if (!x) return null;
  return { href: `https://x.com/${encodeURIComponent(x)}`, label: `@${x}` };
}

const EMPTY = '该项无公开结果';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-white/[0.06] last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="text-[10px] font-mono uppercase tracking-wide text-slate-500 shrink-0 sm:w-36">{label}</span>
      <div className="min-w-0 flex-1 text-xs">{children}</div>
    </div>
  );
}

export type PortraitIdentityGraph = {
  identities?: Array<{ platform?: string; username?: string; profileUrl?: string; email?: string }>;
  links?: Array<{ target?: { platform?: string; profileUrl?: string; username?: string } }>;
} | null;

export type PortraitMultiPlatformContact = {
  stackOverflow?: { profileUrl: string } | null;
  gitlab?: { profileUrl: string; websiteUrl?: string | null } | null;
  devto?: { username: string } | null;
  huggingface?: { profileUrl: string } | null;
  leetcode?: { profileUrl: string } | null;
  kaggle?: { profileUrl: string } | null;
  codeforces?: { profileUrl: string } | null;
  dockerhub?: { profileUrl: string } | null;
  cratesio?: { profileUrl: string } | null;
  npmPackages?: unknown[];
} | null;

export type PortraitCrawlContact = {
  blog?: string | null;
  location?: string | null;
  company?: string | null;
  bio?: string | null;
  email?: string | null;
  twitterUsername?: string | null;
} | null;

export function CodernetPortraitContactSection({
  githubLogin,
  crawl,
  multiPlatform,
  identityGraph,
}: {
  githubLogin: string;
  crawl?: PortraitCrawlContact;
  multiPlatform?: PortraitMultiPlatformContact;
  identityGraph?: PortraitIdentityGraph;
}) {
  const ghMain = `https://github.com/${encodeURIComponent(githubLogin)}`;
  const blog = normalizeHttpUrl(crawl?.blog ?? undefined);
  const emailDirect = crawl?.email?.trim() || null;
  const twitterApi = twitterUrlFromHandle(crawl?.twitterUsername) || twitterFromBio(crawl?.bio ?? null);

  const emailsFromGraph = new Set<string>();
  for (const id of identityGraph?.identities || []) {
    const e = id.email?.trim();
    if (e) emailsFromGraph.add(e);
  }
  const primaryEmail = emailDirect || [...emailsFromGraph][0] || null;
  const secondaryEmails = [...emailsFromGraph].filter((e) => e !== primaryEmail);

  const linkedinUrls = new Set<string>();
  for (const id of identityGraph?.identities || []) {
    const u = id.profileUrl?.trim();
    if (u && /linkedin\.com/i.test(u)) linkedinUrls.add(u);
    if (id.platform?.toLowerCase() === 'linkedin' && u) linkedinUrls.add(u);
  }
  for (const l of identityGraph?.links || []) {
    const u = l.target?.profileUrl?.trim();
    if (u && /linkedin\.com/i.test(u)) linkedinUrls.add(u);
  }

  const npmHome =
    multiPlatform?.npmPackages && multiPlatform.npmPackages.length > 0
      ? `https://www.npmjs.com/~${encodeURIComponent(githubLogin)}`
      : null;

  const devtoUrl = multiPlatform?.devto?.username
    ? `https://dev.to/${encodeURIComponent(multiPlatform.devto.username)}`
    : null;

  let filledLinkCount = 1; // GitHub 主链始终展示为有效
  if (blog?.href) filledLinkCount++;
  if (primaryEmail) filledLinkCount++;
  if (twitterApi) filledLinkCount++;
  if (linkedinUrls.size > 0) filledLinkCount++;
  if (multiPlatform?.stackOverflow?.profileUrl) filledLinkCount++;
  if (multiPlatform?.gitlab?.profileUrl) filledLinkCount++;
  if (normalizeHttpUrl(multiPlatform?.gitlab?.websiteUrl ?? undefined)?.href) filledLinkCount++;
  if (devtoUrl) filledLinkCount++;
  if (multiPlatform?.huggingface?.profileUrl) filledLinkCount++;
  if (multiPlatform?.leetcode?.profileUrl) filledLinkCount++;
  if (multiPlatform?.kaggle?.profileUrl) filledLinkCount++;
  if (multiPlatform?.codeforces?.profileUrl) filledLinkCount++;
  if (multiPlatform?.dockerhub?.profileUrl) filledLinkCount++;
  if (multiPlatform?.cratesio?.profileUrl) filledLinkCount++;
  if (npmHome) filledLinkCount++;
  if (crawl?.location?.trim()) filledLinkCount++;
  if (crawl?.company?.trim()) filledLinkCount++;

  const [expanded, setExpanded] = useState(false);

  const LinkOrEmpty = ({ href, text }: { href: string | null | undefined; text?: string }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline break-all font-mono">
        {text || href}
      </a>
    ) : (
      <span className="text-slate-600">{EMPTY}</span>
    );

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-sm mb-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-start justify-between gap-3 text-left rounded-lg -m-1 p-1 hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-mono">联系方式与主页</h3>
          {expanded ? (
            <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
              以下为公开渠道汇总；无数据时显示「{EMPTY}」。邮箱多为 GitHub 主动公开或身份图谱中的线索。
            </p>
          ) : (
            <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
              当前约 <span className="text-slate-400">{filledLinkCount}</span> 项有公开链接，其余为「{EMPTY}」。点击展开完整列表。
            </p>
          )}
        </div>
        <span className="text-slate-500 text-xs font-mono shrink-0 mt-0.5" aria-hidden>
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      {expanded ? (
      <div className="divide-y-0 mt-3">
        <Row label="GitHub">
          <LinkOrEmpty href={ghMain} text={`@${githubLogin}`} />
        </Row>
        <Row label="个人网站 / Blog">
          <LinkOrEmpty href={blog?.href} text={blog?.label} />
        </Row>
        <Row label="邮箱">
          {primaryEmail ? (
            <a href={`mailto:${primaryEmail}`} className="text-sky-400 hover:underline break-all">
              {primaryEmail}
            </a>
          ) : (
            <span className="text-slate-600">{EMPTY}</span>
          )}
          {secondaryEmails.length > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">其他线索：{secondaryEmails.join(' · ')}</p>
          )}
        </Row>
        <Row label="X (Twitter)">
          {twitterApi ? <LinkOrEmpty href={twitterApi.href} text={twitterApi.label} /> : <span className="text-slate-600">{EMPTY}</span>}
        </Row>
        <Row label="LinkedIn">
          {linkedinUrls.size > 0 ? (
            <ul className="space-y-1">
              {[...linkedinUrls].map((u) => (
                <li key={u}>
                  <LinkOrEmpty href={u} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-slate-600">{EMPTY}</span>
          )}
        </Row>
        <Row label="Stack Overflow">
          <LinkOrEmpty href={multiPlatform?.stackOverflow?.profileUrl} />
        </Row>
        <Row label="GitLab">
          <LinkOrEmpty href={multiPlatform?.gitlab?.profileUrl} />
        </Row>
        <Row label="GitLab 网站">
          <LinkOrEmpty href={normalizeHttpUrl(multiPlatform?.gitlab?.websiteUrl ?? undefined)?.href} />
        </Row>
        <Row label="DEV.to">
          <LinkOrEmpty href={devtoUrl || undefined} />
        </Row>
        <Row label="Hugging Face">
          <LinkOrEmpty href={multiPlatform?.huggingface?.profileUrl} />
        </Row>
        <Row label="LeetCode">
          <LinkOrEmpty href={multiPlatform?.leetcode?.profileUrl} />
        </Row>
        <Row label="Kaggle">
          <LinkOrEmpty href={multiPlatform?.kaggle?.profileUrl} />
        </Row>
        <Row label="Codeforces">
          <LinkOrEmpty href={multiPlatform?.codeforces?.profileUrl} />
        </Row>
        <Row label="Docker Hub">
          <LinkOrEmpty href={multiPlatform?.dockerhub?.profileUrl} />
        </Row>
        <Row label="crates.io">
          <LinkOrEmpty href={multiPlatform?.cratesio?.profileUrl} />
        </Row>
        <Row label="npm 主页">
          {npmHome ? <LinkOrEmpty href={npmHome} /> : <span className="text-slate-600">{EMPTY}</span>}
        </Row>
        <Row label="地点（GitHub）">
          {crawl?.location?.trim() ? <span className="text-slate-300">{crawl.location}</span> : <span className="text-slate-600">{EMPTY}</span>}
        </Row>
        <Row label="公司（GitHub）">
          {crawl?.company?.trim() ? <span className="text-slate-300">{crawl.company}</span> : <span className="text-slate-600">{EMPTY}</span>}
        </Row>
      </div>
      ) : null}
    </div>
  );
}
