/**
 * VibeKids 单页作品入库前的 HTML 安全处理：剥离高风险片段并拒绝不可接受模式。
 * 规则偏保守，适合未成年人作品广场场景；不替代完整 CSP（预览 iframe 仍有 sandbox）。
 */

export type VibekidsHtmlSanitizeResult =
  | { ok: true; html: string; warnings: string[] }
  | { ok: false; code: 'html_policy_rejected'; detail: string };

/** 清洗后仍拒绝入库（属性里的 javascript: 等已在上方处理） */
const CRITICAL_PATTERNS: { re: RegExp; msg: string }[] = [
  { re: /<\s*base\b/i, msg: '不允许 <base> 标签' },
  { re: /<\s*object\b/i, msg: '不允许 <object> 标签' },
  { re: /<\s*embed\b/i, msg: '不允许 <embed> 标签' },
  { re: /<\s*applet\b/i, msg: '不允许 <applet> 标签' },
  { re: /data\s*:\s*text\/html/i, msg: '不允许 data:text/html 内嵌文档' },
  { re: /\bimportScripts\s*\(/i, msg: '不允许 importScripts(' },
  { re: /\beval\s*\(/i, msg: '不允许 eval(' },
  { re: /\bnew\s+Function\s*\(/i, msg: '不允许 new Function(' },
];

function stripTags(html: string, re: RegExp, warning: string, warnings: string[]): string {
  const next = html.replace(re, '');
  if (next !== html) warnings.push(warning);
  return next;
}

/**
 * 清洗并校验；若仍含高危模式则拒绝保存。
 */
export function sanitizeVibekidsWorkHtml(raw: string): VibekidsHtmlSanitizeResult {
  let html = raw;
  const warnings: string[] = [];

  html = stripTags(
    html,
    /<\s*base\b[^>]*>/gi,
    '已移除 <base> 标签',
    warnings,
  );
  html = stripTags(
    html,
    /<\s*object\b[\s\S]*?<\s*\/\s*object\s*>/gi,
    '已移除 <object> 块',
    warnings,
  );
  html = stripTags(html, /<\s*embed\b[^>]*>/gi, '已移除 <embed>', warnings);
  html = stripTags(html, /<\s*applet\b[\s\S]*?<\s*\/\s*applet\s*>/gi, '已移除 <applet>', warnings);

  html = html.replace(/<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, () => {
    warnings.push('已移除 meta refresh');
    return '';
  });

  html = html.replace(
    /<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/gi,
    (full, srcRaw: string) => {
      const src = String(srcRaw).trim().toLowerCase();
      if (src.startsWith('https:')) return full;
      warnings.push('已移除非 HTTPS 的外链 script');
      return '';
    },
  );

  html = html.replace(
    /\s(href|src|action|formaction|poster|data)\s*=\s*(["'])\s*javascript:[^"']*\2/gi,
    (_m, attr: string, q: string) => {
      warnings.push('已 neutralize javascript: URL');
      return ` ${attr}=${q}#${q}`;
    },
  );

  html = html.replace(/\s(href|src|action|formaction)\s*=\s*(["'])\s*vbscript:[^"']*\2/gi, () => {
    warnings.push('已移除 vbscript: URL');
    return ' href=# ';
  });

  html = html.replace(
    /<\s*iframe\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (tag, src: string) => {
      const s = src.trim().toLowerCase();
      if (s.startsWith('https:') || s.startsWith('/') || s === 'about:blank') return tag;
      warnings.push('已移除非安全 iframe src');
      return '';
    },
  );

  const trimmed = html.trim();
  if (!trimmed) {
    return { ok: false, code: 'html_policy_rejected', detail: '安全处理后内容为空' };
  }

  for (const { re, msg } of CRITICAL_PATTERNS) {
    if (re.test(trimmed)) {
      return { ok: false, code: 'html_policy_rejected', detail: msg };
    }
  }

  return { ok: true, html: trimmed, warnings };
}
