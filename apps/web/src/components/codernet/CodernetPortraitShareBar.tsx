'use client';

import { useState, useCallback } from 'react';
import { BRAND_ZH } from '@/lib/brand';

type Props = { ghUsername: string };

async function blobIsPng(blob: Blob): Promise<boolean> {
  const h = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return h.length >= 4 && h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
}

async function readFetchError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { message?: string; error?: string };
    return j?.message || j?.error || text.slice(0, 200) || `HTTP ${res.status}`;
  } catch {
    return text.slice(0, 200) || `HTTP ${res.status}`;
  }
}

export function CodernetPortraitShareBar({ ghUsername }: Props) {
  const [busy, setBusy] = useState<'dl' | 'share' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pagePath = `/codernet/github/${encodeURIComponent(ghUsername)}`;
  const shareImageUrl = useCallback(
    () => `${pagePath}/share-image?v=2&_=${Date.now()}`,
    [pagePath],
  );

  const fullPageUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${pagePath}`;
  }, [pagePath]);

  const copyLink = useCallback(async () => {
    setMsg(null);
    try {
      await navigator.clipboard.writeText(fullPageUrl());
      setMsg('链接已复制。粘贴到微信/飞书等时会显示带图预览卡片。');
    } catch {
      setMsg('复制失败，请手动复制浏览器地址栏中的链接。');
    }
  }, [fullPageUrl]);

  const downloadPng = useCallback(async () => {
    setBusy('dl');
    setMsg(null);
    try {
      const res = await fetch(shareImageUrl(), { cache: 'no-store' });
      if (!res.ok) {
        const detail = await readFetchError(res);
        throw new Error(detail);
      }
      const blob = await res.blob();
      if (blob.size < 64 || !(await blobIsPng(blob))) {
        throw new Error(`无效图片响应（${blob.size} bytes）`);
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${BRAND_ZH}-${ghUsername}-portrait.png`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setMsg('长图已保存到本地，可直接发到聊天或朋友圈。');
    } catch (e) {
      const t = e instanceof Error ? e.message : '未知错误';
      setMsg(`生成分享图失败：${t}`);
    } finally {
      setBusy(null);
    }
  }, [ghUsername, shareImageUrl]);

  const systemShare = useCallback(async () => {
    setBusy('share');
    setMsg(null);
    try {
      const res = await fetch(shareImageUrl(), { cache: 'no-store' });
      if (!res.ok) {
        const detail = await readFetchError(res);
        throw new Error(detail);
      }
      const blob = await res.blob();
      if (blob.size < 64 || !(await blobIsPng(blob))) {
        throw new Error('无效图片，请改用「下载分享长图」');
      }
      const file = new File([blob], `${BRAND_ZH}-${ghUsername}-portrait.png`, { type: 'image/png' });
      const pageUrl = fullPageUrl();
      const withFiles = { files: [file], title: `@${ghUsername} · ${BRAND_ZH} 开发者画像`, text: `查看 @${ghUsername} 的技术画像`, url: pageUrl };
      if (navigator.canShare?.(withFiles)) {
        await navigator.share(withFiles);
        return;
      }
      const linkOnly = { title: withFiles.title, text: withFiles.text, url: pageUrl };
      if (navigator.canShare?.(linkOnly)) {
        await navigator.share(linkOnly);
        return;
      }
      setMsg('当前环境不支持带图分享，请使用「下载分享长图」。');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const t = e instanceof Error ? e.message : '未知错误';
      setMsg(`分享失败：${t}`);
    } finally {
      setBusy(null);
    }
  }, [fullPageUrl, ghUsername, shareImageUrl]);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 mb-6">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-2">分享画像</div>
      <p className="text-xs text-slate-400 mb-3 leading-relaxed">
        <strong className="text-slate-300">复制链接</strong>：社交平台会抓取预览图（与下方长图风格一致）。
        <strong className="text-slate-300"> 下载长图</strong>：得到完整 PNG，可直接发群或保存相册。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="px-4 py-2 rounded-xl bg-white/[0.08] border border-white/[0.1] text-sm text-slate-200 hover:bg-white/[0.12] transition"
        >
          复制链接
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void downloadPng()}
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-semibold text-white transition"
        >
          {busy === 'dl' ? '生成中…' : '下载分享长图'}
        </button>
        {canNativeShare ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void systemShare()}
            className="px-4 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition border border-indigo-400/30"
          >
            {busy === 'share' ? '准备中…' : '系统分享'}
          </button>
        ) : null}
      </div>
      {msg ? <p className="text-xs text-violet-300/90 mt-2">{msg}</p> : null}
    </div>
  );
}
