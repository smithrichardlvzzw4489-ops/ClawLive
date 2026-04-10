import { ImageResponse } from 'next/og';
import { fetchCodernetPortraitForShare } from '@/lib/codernet-portrait-share';
import { CodernetPortraitLongElement } from '@/lib/codernet-portrait-share-jsx';
import { fetchAvatarAsDataUrl } from '@/lib/codernet-portrait-avatar-data-url';
import { loadNotoSansScFontsForOg } from '@/lib/og-noto-sans-sc';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SHARE_W = 1200;
const SHARE_H = 1800;

/** 禁止缓存空/错响应（曾出现 Content-Length:0 + X-Vercel-Cache:HIT） */
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
};

export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const gh = decodeURIComponent(params.username);
  try {
    const [data, fonts] = await Promise.all([
      fetchCodernetPortraitForShare(gh),
      loadNotoSansScFontsForOg(),
    ]);
    const u = (data?.ghUsername || gh).toLowerCase();
    const avatarDataUrl = data?.avatarUrl ? await fetchAvatarAsDataUrl(data.avatarUrl) : null;

    return new ImageResponse(
      <CodernetPortraitLongElement data={data} ghUsername={u} avatarDataUrl={avatarDataUrl} />,
      {
        width: SHARE_W,
        height: SHARE_H,
        fonts,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (err) {
    console.error('[share-image] render failed', gh, err);
    return Response.json(
      {
        error: 'IMAGE_GENERATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE_HEADERS } },
    );
  }
}
