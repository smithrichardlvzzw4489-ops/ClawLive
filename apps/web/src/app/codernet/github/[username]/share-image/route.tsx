import { ImageResponse } from 'next/og';
import { fetchCodernetPortraitForShare } from '@/lib/codernet-portrait-share';
import { CodernetPortraitLongElement } from '@/lib/codernet-portrait-share-jsx';
import { fetchAvatarAsDataUrl } from '@/lib/codernet-portrait-avatar-data-url';

/** next/og 在 Vercel 上应以 Edge 运行；Node 路由易出现空响应 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SHARE_W = 1200;
const SHARE_H = 1800;

export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const gh = decodeURIComponent(params.username);
  try {
    const data = await fetchCodernetPortraitForShare(gh);
    const u = (data?.ghUsername || gh).toLowerCase();
    const avatarDataUrl = data?.avatarUrl ? await fetchAvatarAsDataUrl(data.avatarUrl) : null;

    return new ImageResponse(
      <CodernetPortraitLongElement data={data} ghUsername={u} avatarDataUrl={avatarDataUrl} />,
      { width: SHARE_W, height: SHARE_H },
    );
  } catch (err) {
    console.error('[share-image] render failed', gh, err);
    return Response.json(
      {
        error: 'IMAGE_GENERATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
