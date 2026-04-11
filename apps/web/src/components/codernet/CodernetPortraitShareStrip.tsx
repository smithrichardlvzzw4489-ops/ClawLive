'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BRAND_ZH } from '@/lib/brand';
import { API_BASE_URL } from '@/lib/api';
import { CODENET_SHARE_TRACE_HEADER } from '@/lib/codernet-portrait-share';

type Props = { ghUsername: string };

type PngCache = { status: 'idle' | 'loading' | 'ready' | 'error'; blob: Blob | null; traceId: string | null };

async function blobIsPng(blob: Blob): Promise<boolean> {
  const h = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return h.length >= 4 && h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
}

function formatTraceHint(traceId: string | null | undefined): string {
  if (!traceId) return '';
  return `（追踪 ID：${traceId}，可查 Edge/服务端日志）`;
}

async function readFetchError(res: Response): Promise<{ detail: string; traceId?: string }> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { message?: string; error?: string; traceId?: string };
    const detail = j?.message || j?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    const traceId = typeof j?.traceId === 'string' ? j.traceId : undefined;
    return { detail, traceId };
  } catch {
    return { detail: text.slice(0, 200) || `HTTP ${res.status}` };
  }
}

function reportPortraitShare(action: 'copyLink' | 'downloadPng' | 'nativeShare') {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return;
  const base = API_BASE_URL || '';
  void fetch(`${base}/api/codernet/portrait-share`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  }).catch(() => {});
}

export function CodernetPortraitShareStrip({ ghUsername }: Props) {
  const [busy, setBusy] = useState<'dl' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pngRef = useRef<PngCache>({ status: 'idle', blob: null, traceId: null });

  const pagePath = `/codernet/github/${encodeURIComponent(ghUsername)}`;
  const shareImageUrl = useCallback(
    () => `${pagePath}/share-image?v=2&_=${Date.now()}`,
    [pagePath],
  );

  const fullPageUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${pagePath}`;
  }, [pagePath]);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      pngRef.current = { status: 'loading', blob: null, traceId: null };
      const url = shareImageUrl();
      void (async () => {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          const headerTrace = res.headers.get(CODENET_SHARE_TRACE_HEADER) || null;
          if (cancelled) return;
          if (!res.ok) {
            const { detail, traceId } = await readFetchError(res);
            const tid = traceId || headerTrace || null;
            console.warn('[CodernetPortraitShare] prefetch http_error', { url, status: res.status, tid, detail });
            pngRef.current = { status: 'error', blob: null, traceId: tid };
            return;
          }
          const blob = await res.blob();
          const ct = res.headers.get('content-type') || '';
          if (blob.size < 64 || !(await blobIsPng(blob))) {
            console.warn('[CodernetPortraitShare] prefetch invalid_png', {
              url,
              size: blob.size,
              contentType: ct,
              traceId: headerTrace,
            });
            pngRef.current = { status: 'error', blob: null, traceId: headerTrace };
            return;
          }
          pngRef.current = { status: 'ready', blob, traceId: headerTrace };
        } catch (e) {
          if (!cancelled) {
            console.warn('[CodernetPortraitShare] prefetch failed', e);
            pngRef.current = { status: 'error', blob: null, traceId: null };
          }
        }
      })();
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [ghUsername, shareImageUrl]);

  const copyLink = useCallback(() => {
    setMsg(null);
    void (async () => {
      try {
        await navigator.clipboard.writeText(fullPageUrl());
        reportPortraitShare('copyLink');
        setMsg('链接已复制。');
      } catch {
        setMsg('复制失败，请手动复制地址栏链接。');
      }
    })();
  }, [fullPageUrl]);

  const downloadPng = useCallback(async () => {
    setBusy('dl');
    setMsg(null);
    try {
      let blob = pngRef.current.status === 'ready' ? pngRef.current.blob : null;
      let headerTrace = pngRef.current.traceId;
      if (!blob) {
        const url = shareImageUrl();
        const res = await fetch(url, { cache: 'no-store' });
        headerTrace = res.headers.get(CODENET_SHARE_TRACE_HEADER) || null;
        if (!res.ok) {
          const { detail, traceId } = await readFetchError(res);
          const tid = traceId || headerTrace || undefined;
          console.error('[CodernetPortraitShare] download http_error', { url, status: res.status, traceId: tid, detail });
          throw new Error(`${detail}${formatTraceHint(tid)}`);
        }
        blob = await res.blob();
        const ct = res.headers.get('content-type') || '';
        if (!blob || blob.size < 64 || !(await blobIsPng(blob))) {
          console.error('[CodernetPortraitShare] download invalid_png', {
            url,
            status: res.status,
            contentType: ct,
            size: blob?.size,
            traceId: headerTrace,
          });
          throw new Error(
            `无效图片响应（${blob?.size ?? 0} bytes，类型 ${ct || '?'}）` + formatTraceHint(headerTrace),
          );
        }
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
      reportPortraitShare('downloadPng');
      setMsg('长图已保存。');
    } catch (e) {
      const t = e instanceof Error ? e.message : '未知错误';
      setMsg(`生成分享图失败：${t}`);
    } finally {
      setBusy(null);
    }
  }, [ghUsername, shareImageUrl]);

  const systemShare = useCallback(() => {
    setMsg(null);
    const pageUrl = fullPageUrl();
    const cache = pngRef.current;
    if (cache.status !== 'ready' || !cache.blob) {
      setMsg(
        cache.status === 'loading'
          ? '分享图加载中，请稍后再点「系统分享」。'
          : '分享图尚未就绪，请稍后重试或使用「下载分享长图」。',
      );
      return;
    }
    const file = new File([cache.blob], `${BRAND_ZH}-${ghUsername}-portrait.png`, { type: 'image/png' });
    const withFiles = {
      files: [file],
      title: `@${ghUsername} · ${BRAND_ZH} 开发者画像`,
      text: `查看 @${ghUsername} 的技术画像`,
      url: pageUrl,
    };
    try {
      if (navigator.canShare?.(withFiles)) {
        void navigator
          .share(withFiles)
          .then(() => {
            reportPortraitShare('nativeShare');
          })
          .catch((e: Error) => {
            if (e?.name === 'AbortError') return;
            setMsg(`分享失败：${e?.message || '未知错误'}`);
          });
        return;
      }
      const linkOnly = { title: withFiles.title, text: withFiles.text, url: pageUrl };
      if (navigator.canShare?.(linkOnly)) {
        void navigator
          .share(linkOnly)
          .then(() => {
            reportPortraitShare('nativeShare');
          })
          .catch((e: Error) => {
            if (e?.name === 'AbortError') return;
            setMsg(`分享失败：${e?.message || '未知错误'}`);
          });
        return;
      }
      setMsg('当前环境不支持带图分享，请使用「下载分享长图」。');
    } catch (e) {
      const t = e instanceof Error ? e.message : '未知错误';
      setMsg(`分享失败：${t}`);
    }
  }, [fullPageUrl, ghUsername]);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <button
        type="button"
        onClick={copyLink}
        className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-slate-300 hover:bg-white/[0.1] transition"
      >
        复制链接
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void downloadPng()}
        className="px-3 py-1.5 rounded-lg bg-violet-600/90 hover:bg-violet-500 disabled:opacity-50 text-xs font-medium text-white transition"
      >
        {busy === 'dl' ? '生成中…' : '下载分享长图'}
      </button>
      {canNativeShare ? (
        <button
          type="button"
          onClick={systemShare}
          className="px-3 py-1.5 rounded-lg bg-indigo-600/70 hover:bg-indigo-500 text-xs font-medium text-white transition border border-indigo-400/25"
        >
          系统分享
        </button>
      ) : null}
      {msg ? <span className="text-[11px] text-violet-300/90 w-full sm:w-auto">{msg}</span> : null}
    </div>
  );
}
