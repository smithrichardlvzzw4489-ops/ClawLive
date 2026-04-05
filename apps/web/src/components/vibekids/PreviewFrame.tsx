"use client";

import { useCallback, useEffect, useRef } from "react";

type Props = {
  html: string;
  title?: string;
  /** 切换版本时强制重建 iframe，避免偶发空白不刷新 */
  frameKey?: number;
};

const MEASURE_MIN_W = 320;
const MEASURE_MIN_H = 240;
/** 避免异常页撑爆布局 */
const MEASURE_CAP = 12000;
const FIT_PAD = 10;

function readContentSize(doc: Document): { w: number; h: number } {
  const body = doc.body;
  const root = doc.documentElement;
  const w = Math.min(
    MEASURE_CAP,
    Math.max(
      body.scrollWidth,
      root.scrollWidth,
      body.offsetWidth,
      root.offsetWidth,
      MEASURE_MIN_W,
    ),
  );
  const h = Math.min(
    MEASURE_CAP,
    Math.max(
      body.scrollHeight,
      root.scrollHeight,
      body.offsetHeight,
      root.offsetHeight,
      MEASURE_MIN_H,
    ),
  );
  return { w, h };
}

function fitIframeToContainer(
  container: HTMLDivElement,
  iframe: HTMLIFrameElement,
): void {
  try {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw < 8 || ch < 8) return;

    // 在过小视口里测量会得到偏小的 scroll 尺寸；先拉大布局再量
    iframe.style.transform = "none";
    const probeW = Math.max(cw * 4, 2000);
    const probeH = Math.max(ch * 4, 2800);
    iframe.style.width = `${probeW}px`;
    iframe.style.height = `${probeH}px`;
    void iframe.offsetWidth;
    void doc.body.offsetHeight;

    let { w, h } = readContentSize(doc);

    void iframe.offsetWidth;
    const second = readContentSize(doc);
    w = Math.max(w, second.w);
    h = Math.max(h, second.h);

    const innerW = Math.max(FIT_PAD * 2, cw - FIT_PAD * 2);
    const innerH = Math.max(FIT_PAD * 2, ch - FIT_PAD * 2);
    const s = Math.min(1, innerW / w, innerH / h);

    // 整页按比例缩进可视区后，关闭文档级滚动避免双滚动条
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    doc.documentElement.style.margin = "0";
    doc.body.style.margin = "0";

    iframe.style.width = `${w}px`;
    iframe.style.height = `${h}px`;
    iframe.style.transform = `scale(${s})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.maxWidth = "none";
    iframe.style.maxHeight = "none";
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
  const fitTimersRef = useRef<number[]>([]);

  const clearFitTimers = useCallback(() => {
    fitTimersRef.current.forEach((id) => window.clearTimeout(id));
    fitTimersRef.current = [];
  }, []);

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
    return () => {
      ro.disconnect();
      clearFitTimers();
    };
  }, [trimmed, frameKey, runFit, clearFitTimers]);

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
          clearFitTimers();
          window.requestAnimationFrame(() => runFit());
          for (const ms of [50, 200, 500, 1200, 2500]) {
            fitTimersRef.current.push(window.setTimeout(runFit, ms));
          }
        }}
      />
    </div>
  );
}
