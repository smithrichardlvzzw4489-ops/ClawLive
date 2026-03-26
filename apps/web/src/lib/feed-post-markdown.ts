/** 一键排版：整理换行、合并多余空行、去除行尾空格 */
export function oneClickLayoutMarkdown(text: string): string {
  let s = text.replace(/\r\n/g, '\n');
  const lines = s.split('\n').map((line) => line.trimEnd());
  s = lines.join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** 摘要/卡片用：去掉常见 Markdown 标记 */
export function stripMarkdownForExcerpt(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_~]{1,2}([^*_~]+)[*_~]{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerptPlainText(text: string, maxLen: number): string {
  const t = stripMarkdownForExcerpt(text);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

export const FEED_POST_MAX_TITLE = 120;
export const FEED_POST_MAX_CONTENT = 20000;
/** 写图文：正文纯文字上限 */
export const FEED_IMAGE_TEXT_MAX_CONTENT = 600;
