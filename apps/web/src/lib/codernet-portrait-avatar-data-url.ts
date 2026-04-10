/**
 * Satori / next/og 对 GitHub 头像外链抓取在 Edge 上常失败；先 fetch 再内联为 data URL。
 * 适用于 Edge / Node。
 */

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

export async function fetchAvatarAsDataUrl(imageUrl: string): Promise<string | null> {
  const trimmed = imageUrl?.trim();
  if (!trimmed || !trimmed.startsWith('http')) return null;
  try {
    const res = await fetch(trimmed, {
      headers: {
        Accept: 'image/*',
        'User-Agent': 'Mozilla/5.0 (compatible; GITLINK-Portrait/1.0)',
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const rawCt = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    if (!rawCt.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 32 || buf.byteLength > 2_500_000) return null;
    return `data:${rawCt};base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return null;
  }
}
