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
const MEASURE_CAP = 12000;
/** contain 缩放：内缩 2px，避免贴边裁切感 */
const FIT_INSET = 2;
/** 内容小于预览框时最大放大倍数 */
const MAX_UPSCALE = 2.25;

/** 展开内部 overflow 区域，避免 scrollHeight 只反映「小视口内」高度 */
function expandInnerScrollers(doc: Document): void {
  const win = doc.defaultView;
  if (!win || !doc.body) return;

  const nodes = [doc.body, ...doc.body.querySelectorAll<HTMLElement>("*")];
  for (const el of nodes) {
    const cs = win.getComputedStyle(el);
    const oy = cs.overflowY;
    const ox = cs.overflowX;
    const tallInner = el.scrollHeight > el.clientHeight + 2;
    const wideInner = el.scrollWidth > el.clientWidth + 2;
    if (
      oy === "auto" ||
      oy === "scroll" ||
      ox === "auto" ||
      ox === "scroll" ||
      tallInner ||
      wideInner
    ) {
      el.style.overflow = "visible";
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
      if (cs.maxHeight && cs.maxHeight !== "none") el.style.maxHeight = "none";
      if (cs.maxWidth && cs.maxWidth !== "none") el.style.maxWidth = "none";
    }
  }
}

/** 用子元素包围盒补全测量（卡片、拼图块等） */
function unionContentRect(doc: Document): { w: number; h: number } {
  const body = doc.body;
  const win = doc.defaultView;
  if (!win) return { w: 0, h: 0 };

  const bodyRect = body.getBoundingClientRect();
  let maxRight = bodyRect.left;
  let maxBottom = bodyRect.top;

  const walk = (root: Element) => {
    const children = root.querySelectorAll("*");
    for (const el of children) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        maxRight = Math.max(maxRight, r.right);
        maxBottom = Math.max(maxBottom, r.bottom);
      }
    }
  };
  walk(doc.documentElement);

  const uw = Math.max(0, Math.ceil(maxRight - bodyRect.left));
  const uh = Math.max(0, Math.ceil(maxBottom - bodyRect.top));
  return { w: uw, h: uh };
}

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

    iframe.style.transform = "none";
    const probeW = Math.max(cw * 4, 2000);
    const probeH = Math.max(ch * 4, 2800);
    iframe.style.width = `${probeW}px`;
    iframe.style.height = `${probeH}px`;
    void iframe.offsetWidth;

    expandInnerScrollers(doc);
    void doc.body.offsetHeight;

    let { w, h } = readContentSize(doc);
    const u = unionContentRect(doc);
    w = Math.max(w, u.w, MEASURE_MIN_W);
    h = Math.max(h, u.h, MEASURE_MIN_H);

    void iframe.offsetWidth;
    expandInnerScrollers(doc);
    void doc.body.offsetHeight;
    const second = readContentSize(doc);
    const u2 = unionContentRect(doc);
    w = Math.min(MEASURE_CAP, Math.max(w, second.w, u2.w));
    h = Math.min(MEASURE_CAP, Math.max(h, second.h, u2.h));

    w = Math.ceil(w);
    h = Math.ceil(h);

    const innerW = Math.max(8, cw - FIT_INSET * 2);
    const innerH = Math.max(8, ch - FIT_INSET * 2);
    // contain：整页缩进可视区，不裁切；留白与外层 bg-slate-50 一致，弱化「展示框」
    let s = Math.min(innerW / w, innerH / h);
    if (s > 1) {
      s = Math.min(s, MAX_UPSCALE);
    }

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

    const sw = w * s;
    const sh = h * s;
    iframe.style.left = `${(cw - sw) / 2}px`;
    iframe.style.top = `${(ch - sh) / 2}px`;
  } catch {
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.transform = "";
    iframe.style.left = "0";
    iframe.style.top = "0";
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
      <div className="flex min-h-[min(160px,26dvh)] w-full flex-1 items-center justify-center px-2 text-center text-xs text-slate-500 max-lg:rounded-none max-lg:bg-slate-50 lg:min-h-[min(320px,40dvh)] lg:rounded-2xl lg:border lg:border-dashed lg:border-slate-200 lg:bg-slate-50 lg:text-sm">
        暂无预览内容（生成成功但 HTML 为空时可刷新重试）
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="vk-preview-root relative isolate h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden max-lg:rounded-none max-lg:bg-slate-50 [color-scheme:light] lg:rounded-2xl lg:bg-white lg:[min-height:min(380px,44dvh)]"
    >
      <iframe
        key={frameKey}
        ref={iframeRef}
        title={title}
        className="absolute inset-0 box-border h-full min-h-0 w-full max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:ring-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-inner"
        sandbox="allow-scripts allow-forms allow-same-origin"
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
