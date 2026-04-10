/**
 * next/og (Satori) 渲染中文必须注册 CJK 字体，否则常见结果为「200 + image/png + 0 字节」。
 * 通过 Google Fonts CSS 解析 woff2 地址后拉取（Edge 可用）。
 */

/** next/og FontOptions.weight 为字面量联合 */
type OgWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type OgFont = { name: string; data: ArrayBuffer; weight: OgWeight; style: 'normal' };

const FONT_FAMILY = 'Noto Sans SC';

export async function loadNotoSansScFontsForOg(): Promise<OgFont[]> {
  const cssRes = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap',
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    },
  );
  if (!cssRes.ok) throw new Error(`Google Fonts CSS failed: ${cssRes.status}`);

  const css = await cssRes.text();
  const out: OgFont[] = [];
  const seen = new Set<string>();

  const re =
    /font-weight:\s*(\d+)[^}]*?url\(([^)]+)\)\s*format\(['"]woff2['"]\)/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const wn = Number(m[1]);
    const allowed = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    if (!allowed.has(wn)) continue;
    const weight = wn as OgWeight;
    const rawUrl = m[2].replace(/^['"]|['"]$/g, '').trim();
    if (!rawUrl.startsWith('http') || seen.has(`${weight}:${rawUrl}`)) continue;
    seen.add(`${weight}:${rawUrl}`);
    const fontRes = await fetch(rawUrl);
    if (!fontRes.ok) continue;
    const data = await fontRes.arrayBuffer();
    if (data.byteLength < 1000) continue;
    out.push({ name: FONT_FAMILY, data, weight, style: 'normal' });
  }

  if (!out.length) {
    throw new Error('No Noto Sans SC woff2 fonts could be loaded for OG');
  }
  return out;
}

export const OG_CJK_FONT_FAMILY = `${FONT_FAMILY}, ui-sans-serif, system-ui, sans-serif`;
