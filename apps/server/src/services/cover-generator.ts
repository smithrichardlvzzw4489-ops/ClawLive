/**
 * 封面卡片生成器
 *
 * 根据标题 + 摘要自动生成一张文字卡片图（PNG），风格：
 *   - 浅色渐变背景，大引号装饰
 *   - 居中展示摘要文字（来自文章正文前 80 字）
 *   - 底部显示标题
 *
 * 技术路径：SVG string → sharp → PNG Buffer，无需浏览器，< 200 ms
 */
import sharp from 'sharp';

const WIDTH = 800;
const HEIGHT = 800;

/** 将长文本按宽度拆成多行（SVG 不支持自动换行） */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let remaining = text.trim().replace(/\s+/g, ' ');
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining);
      break;
    }
    // 找最近的标点或空格断行
    let cut = maxCharsPerLine;
    const puncts = ['，', '。', '！', '？', '；', '、', '…', ' ', ',', '.', '!', '?'];
    for (let i = maxCharsPerLine; i >= maxCharsPerLine - 6 && i > 0; i--) {
      if (puncts.includes(remaining[i])) { cut = i + 1; break; }
    }
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return lines;
}

/** 提取正文前 ~80 字作为摘要（去掉 Markdown 语法） */
function extractSummary(content: string, maxLen = 80): string {
  const cleaned = content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/[-*>]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  // 在 maxLen 附近找自然断句点
  const cutoff = cleaned.lastIndexOf('。', maxLen) || cleaned.lastIndexOf('，', maxLen);
  if (cutoff > maxLen * 0.6) return cleaned.slice(0, cutoff + 1);
  return cleaned.slice(0, maxLen) + '…';
}

// 颜色主题（渐变背景可扩展）
const THEMES = [
  { bg1: '#fdfcfb', bg2: '#f4f0eb', accent: '#c8a882', text: '#2d2320', sub: '#8b7355' },
  { bg1: '#f8f9ff', bg2: '#eef0fb', accent: '#7b8ce8', text: '#1e2040', sub: '#6b7280' },
  { bg1: '#f0faf4', bg2: '#e4f5ea', accent: '#5bab7a', text: '#1a3324', sub: '#4a7a5c' },
  { bg1: '#fff8f0', bg2: '#fdeede', accent: '#e8834a', text: '#2d1800', sub: '#7a4a20' },
];

function pickTheme(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return THEMES[h % THEMES.length];
}

export async function generateCover(
  title: string,
  content: string,
): Promise<Buffer> {
  const theme = pickTheme(title);
  const summary = extractSummary(content, 72);
  const summaryLines = wrapText(summary, 18); // ~18 汉字/行（考虑标点）
  const titleLines = wrapText(title.slice(0, 40), 20);

  // 摘要文字位置
  const summaryFontSize = 36;
  const summaryLineHeight = 58;
  const summaryBlockH = summaryLines.length * summaryLineHeight;
  const summaryStartY = (HEIGHT - summaryBlockH) / 2 - 20;

  const summarySvg = summaryLines
    .map(
      (line, i) =>
        `<text x="50%" y="${summaryStartY + i * summaryLineHeight}"
           dominant-baseline="auto" text-anchor="middle"
           font-family="'Noto Sans CJK SC','Noto Sans SC','WenQuanYi Zen Hei','PingFang SC','Microsoft YaHei',sans-serif"
           font-size="${summaryFontSize}" fill="${theme.text}" font-weight="400"
           letter-spacing="2">${escapeXml(line)}</text>`,
    )
    .join('\n');

  // 标题行（底部）
  const titleFontSize = 26;
  const titleLineHeight = 42;
  const titleStartY = HEIGHT - 100;
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="50%" y="${titleStartY + i * titleLineHeight}"
           dominant-baseline="auto" text-anchor="middle"
           font-family="'Noto Sans CJK SC','Noto Sans SC','WenQuanYi Zen Hei','PingFang SC','Microsoft YaHei',sans-serif"
           font-size="${titleFontSize}" fill="${theme.sub}" font-weight="500"
           letter-spacing="1">${escapeXml(line)}</text>`,
    )
    .join('\n');

  // 分隔线 Y（摘要块下方 30px）
  const dividerY = summaryStartY + summaryBlockH + 40;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>
  </defs>

  <!-- 背景 -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" rx="0"/>

  <!-- 内边距装饰框 -->
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}"
        fill="none" stroke="${theme.accent}" stroke-width="1" stroke-opacity="0.25" rx="16"/>

  <!-- 大引号装饰 -->
  <text x="80" y="165"
    font-family="Georgia,'Times New Roman',serif"
    font-size="160" fill="${theme.accent}" opacity="0.15"
    font-weight="700">\u201c</text>

  <!-- 摘要文字 -->
  ${summarySvg}

  <!-- 分隔线 -->
  <line x1="${WIDTH / 2 - 60}" y1="${dividerY}" x2="${WIDTH / 2 + 60}" y2="${dividerY}"
        stroke="${theme.accent}" stroke-width="1.5" stroke-opacity="0.5"/>

  <!-- 标题 -->
  ${titleSvg}
</svg>`;

  const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
  return buf;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
