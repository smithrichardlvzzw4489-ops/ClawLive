"use client";

import { useCallback, useEffect, useRef } from "react";

type Props = {
  html: string;
  title?: string;
  /** 切换版本时强制重建 iframe，避免偶发空白不刷新 */
  frameKey?: number;
};

function fitIframeToContainer(
  container: HTMLDivElement,
  iframe: HTMLIFrameElement,
): void {
  try {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    const body = doc.body;
    const root = doc.documentElement;
    const w = Math.max(
      body.scrollWidth,
      root.scrollWidth,
      body.offsetWidth,
      root.clientWidth,
      320,
    );
    const h = Math.max(
      body.scrollHeight,
      root.scrollHeight,
      body.offsetHeight,
      root.clientHeight,
      240,
    );

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw < 8 || ch < 8) return;

    const s = Math.min(1, cw / w, ch / h);
    iframe.style.width = `${w}px`;
    iframe.style.height = `${h}px`;
    iframe.style.transform = `scale(${s})`;
    iframe.style.transformOrigin = "top left";
  } catch {
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.transform = "";
  }
}

export function PreviewFrame({ html, title = "预览", frameKey }: Props) {
  const trimmed = html.trim();
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const runFit = useCallback(() => {
    const c = wrapRef.current;
    const f = iframeRef.current;
    if (c && f) fitIframeToContainer(c, f);
  }, []);

  useEffect(() => {
    const c = wrapRef.current;
    if (!c || !trimmed) return;
    const ro = new ResizeObserver(() => {
      runFit();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [trimmed, frameKey, runFit]);

  if (!trimmed) {
    return (
      <div className="flex min-h-[min(160px,26dvh)] w-full flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-2 text-center text-xs text-slate-500 lg:min-h-[min(320px,40dvh)] lg:text-sm">
        暂无预览内容（生成成功但 HTML 为空时可刷新重试）
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-2xl bg-slate-50 [min-height:min(180px,28dvh)] lg:[min-height:min(380px,44dvh)] lg:min-h-0"
    >
      <iframe
        key={frameKey}
        ref={iframeRef}
        title={title}
        className="absolute left-0 top-0 rounded-2xl border border-slate-200 bg-white shadow-inner"
        sandbox="allow-scripts allow-forms"
        srcDoc={trimmed}
        onLoad={() => {
          window.requestAnimationFrame(() => runFit());
          window.setTimeout(runFit, 300);
          window.setTimeout(runFit, 900);
        }}
      />
    </div>
  );
}
