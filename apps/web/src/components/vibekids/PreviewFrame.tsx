"use client";

import { useCallback, useEffect, useRef } from "react";

type Props = {
  html: string;
  title?: string;
  /** 切换版本时强制重建 iframe，避免偶发空白不刷新 */
  frameKey?: number;
  /**
   * 作品详情页等：iframe 内自然滚动，不做 transform 缩放。
   * 部分内置浏览器（如微信 web-view）对 srcDoc + 缩放组合易出白屏，Blob URL + 本模式更稳。
   */
  nativeScroll?: boolean;
};

/** 测量下限过小会误判，过大（如 320）会把窄页面强行算宽导致缩放偏小 */
const MEASURE_MIN_W = 200;
const MEASURE_MIN_H = 160;
const MEASURE_CAP = 12000;
const FIT_INSET = 2;
/** 内容小于预览框时最大放大倍数 */
const MAX_UPSCALE = 2.5;

/**
 * 模型输出的片段常缺 viewport，iframe 内会按「桌面宽度」排版再被缩放，表现为巨大字号、裁切。
 * 测量时也应使用真实容器宽度，否则 (max-width: …px) 媒体查询永远不命中。
 */
function ensurePreviewDocumentHtml(
  html: string,
  opts?: { nativeScroll?: boolean },
): string {
  const t = html.trim();
  if (!t) return t;

  const hasViewport = /name\s*=\s*["']viewport["']/i.test(t);
  const rootCss = opts?.nativeScroll ?
    "html,body{margin:0;max-width:100%;box-sizing:border-box;height:auto!important;min-height:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}"
  : "html,body{margin:0;max-width:100%;box-sizing:border-box}";
  const headInject =
    `<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/><style>${rootCss}*,*::before,*::after{box-sizing:border-box}</style>`;

  const nativePatch =
    '<style id="vk-native-embed">html,body{height:auto!important;min-height:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}</style>';

  if (/<head[^>]*>/i.test(t)) {
    if (hasViewport) {
      if (
        opts?.nativeScroll &&
        !/id=["']vk-native-embed["']/i.test(t)
      ) {
        return t.replace(
          /<head[^>]*>/i,
          (open) => `${open}${nativePatch}`,
        );
      }
      return t;
    }
    return t.replace(/<head[^>]*>/i, (open) => `${open}${headInject}`);
  }

  if (/<html[\s>]/i.test(t)) {
    if (hasViewport) {
      if (
        opts?.nativeScroll &&
        !/id=["']vk-native-embed["']/i.test(t) &&
        /<head[^>]*>/i.test(t)
      ) {
        return t.replace(
          /<head[^>]*>/i,
          (open) => `${open}${nativePatch}`,
        );
      }
      return t;
    }
    return t.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${headInject}</head>`,
    );
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head>${headInject}</head><body>${t}</body></html>`;
}

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

/**
 * body 常设 min-height:100vh，scrollHeight 巨大，但真正 UI 只是一小块。
 * 若 scroll 比子元素包围盒「松」很多，则按包围盒尺寸缩放，cover 才能把小块放大铺满预览区。
 */
function pickScaleBox(
  scrollW: number,
  scrollH: number,
  uw: number,
  uh: number,
): { w: number; h: number } {
  if (uw < 8 && uh < 8) {
    return {
      w: Math.min(MEASURE_CAP, Math.max(scrollW, MEASURE_MIN_W)),
      h: Math.min(MEASURE_CAP, Math.max(scrollH, MEASURE_MIN_H)),
    };
  }
  const uW = Math.max(uw, 48);
  const uH = Math.max(uh, 48);
  const sW = Math.max(scrollW, MEASURE_MIN_W);
  const sH = Math.max(scrollH, MEASURE_MIN_H);
  const hSlack = sH / uH;
  const wSlack = sW / uW;
  const H_THRESH = 1.28;
  const W_THRESH = 1.32;
  const hPick =
    hSlack >= H_THRESH
      ? Math.min(MEASURE_CAP, Math.max(uH, MEASURE_MIN_H))
      : Math.min(MEASURE_CAP, Math.max(sH, uH, MEASURE_MIN_H));
  const wPick =
    wSlack >= W_THRESH
      ? Math.min(MEASURE_CAP, Math.max(uW, MEASURE_MIN_W))
      : Math.min(MEASURE_CAP, Math.max(sW, uW, MEASURE_MIN_W));
  return { w: wPick, h: hPick };
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
    // 用容器宽度布局，才能让子页 responsive CSS / rem 与真机一致；过宽探测会误判尺寸并触发错误放大
    const probeW = Math.max(Math.ceil(cw), MEASURE_MIN_W);
    const probeH = Math.max(Math.ceil(ch * 3), 900, MEASURE_MIN_H * 4);
    iframe.style.width = `${probeW}px`;
    iframe.style.height = `${probeH}px`;
    void iframe.offsetWidth;

    expandInnerScrollers(doc);
    void doc.body.offsetHeight;
    void iframe.offsetWidth;
    expandInnerScrollers(doc);
    void doc.body.offsetHeight;
    const scroll = readContentSize(doc);
    const u = unionContentRect(doc);
    const box = pickScaleBox(scroll.w, scroll.h, u.w, u.h);
    let w = Math.ceil(box.w);
    let h = Math.ceil(box.h);
    w = Math.max(w, MEASURE_MIN_W);
    h = Math.max(h, MEASURE_MIN_H);

    const innerW = Math.max(8, cw - FIT_INSET * 2);
    const innerH = Math.max(8, ch - FIT_INSET * 2);
    // 统一 contain：完整可见。窄屏曾用 cover 会按短边铺满、长边裁切，导致标题/输入框被切掉（用户看到的「不适配」）
    let s = Math.min(innerW / w, innerH / h);
    if (!Number.isFinite(s) || s <= 0) s = 1;
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

export function PreviewFrame({
  html,
  title = "预览",
  frameKey,
  nativeScroll = false,
}: Props) {
  const trimmed = html.trim();
  const srcDocHtml = trimmed
    ? ensurePreviewDocumentHtml(trimmed, { nativeScroll })
    : "";
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fitTimersRef = useRef<number[]>([]);

  const clearFitTimers = useCallback(() => {
    fitTimersRef.current.forEach((id) => window.clearTimeout(id));
    fitTimersRef.current = [];
  }, []);

  const runFit = useCallback(() => {
    if (nativeScroll) return;
    const c = wrapRef.current;
    const f = iframeRef.current;
    if (c && f) fitIframeToContainer(c, f);
  }, [nativeScroll]);

  useEffect(() => {
    if (!srcDocHtml) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const blob = new Blob([srcDocHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    iframe.src = url;
    return () => {
      try {
        iframe.src = "about:blank";
      } catch {
        /* */
      }
      URL.revokeObjectURL(url);
    };
  }, [srcDocHtml, frameKey]);

  useEffect(() => {
    if (nativeScroll || !srcDocHtml) return;
    const c = wrapRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      runFit();
    });
    ro.observe(c);
    return () => {
      ro.disconnect();
      clearFitTimers();
    };
  }, [nativeScroll, srcDocHtml, frameKey, runFit, clearFitTimers]);

  const onIframeLoad = useCallback(() => {
    if (nativeScroll) return;
    clearFitTimers();
    window.requestAnimationFrame(() => runFit());
    for (const ms of [50, 200, 500, 1200, 2500]) {
      fitTimersRef.current.push(window.setTimeout(runFit, ms));
    }
  }, [nativeScroll, clearFitTimers, runFit]);

  if (!trimmed) {
    return (
      <div className="flex min-h-[min(160px,26dvh)] w-full flex-1 items-center justify-center px-2 text-center text-xs text-slate-500 max-lg:rounded-none max-lg:bg-slate-50 lg:min-h-[min(320px,40dvh)] lg:rounded-2xl lg:border lg:border-dashed lg:border-slate-200 lg:bg-slate-50 lg:text-sm">
        暂无预览内容（生成成功但 HTML 为空时可刷新重试）
      </div>
    );
  }

  const iframeClass = nativeScroll ?
      "box-border block h-full min-h-full w-full max-lg:rounded-none max-lg:border-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-inner"
    : "absolute inset-0 box-border h-full min-h-0 w-full max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:ring-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-inner";

  return (
    <div
      ref={wrapRef}
      className="vk-preview-root relative isolate h-full min-h-[min(240px,36dvh)] w-full min-w-0 flex-1 overflow-hidden max-lg:rounded-none max-lg:bg-slate-50 [color-scheme:light] lg:min-h-0 lg:rounded-2xl lg:bg-white lg:[min-height:min(380px,44dvh)]"
    >
      <iframe
        key={frameKey}
        ref={iframeRef}
        title={title}
        className={iframeClass}
        sandbox="allow-scripts allow-forms allow-same-origin"
        onLoad={onIframeLoad}
      />
    </div>
  );
}
