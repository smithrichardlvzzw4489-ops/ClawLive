import { ImageResponse } from 'next/og';
import {
  CODENET_SHARE_TRACE_HEADER,
  fetchCodernetPortraitForShareWithMeta,
} from '@/lib/codernet-portrait-share';
import { CodernetPortraitLongElement } from '@/lib/codernet-portrait-share-jsx';
import { fetchAvatarAsDataUrl } from '@/lib/codernet-portrait-avatar-data-url';
import { loadNotoSansScFontsForOg } from '@/lib/og-noto-sans-sc';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SHARE_W = 1200;
/** 容纳完整文案、多平台摘要、仓库列表等；过低会裁切底部 */
const SHARE_H = 5400;

/** 禁止缓存空/错响应（曾出现 Content-Length:0 + X-Vercel-Cache:HIT） */
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
};

function logShare(stage: string, payload: Record<string, unknown>) {
  console.log(`[codernet-share-image] ${stage} ${JSON.stringify(payload)}`);
}

export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const traceId = crypto.randomUUID();
  const gh = decodeURIComponent(params.username);
  const traceHeaders = { ...NO_STORE_HEADERS, [CODENET_SHARE_TRACE_HEADER]: traceId };

  try {
    const tParallel = Date.now();
    const [{ data, meta: profileMeta }, fonts] = await Promise.all([
      fetchCodernetPortraitForShareWithMeta(gh, { traceId }),
      loadNotoSansScFontsForOg(),
    ]);
    logShare('profile+fonts', {
      traceId,
      gh,
      parallelWallMs: Date.now() - tParallel,
      profileApiMs: profileMeta.durationMs,
      profileHttp: profileMeta.httpStatus,
      profileJsonStatus: profileMeta.jsonStatus ?? null,
      hasData: !!data,
      fontsCount: fonts.length,
    });

    const u = (data?.ghUsername || gh).toLowerCase();
    const tAvatar = Date.now();
    const avatarDataUrl = data?.avatarUrl ? await fetchAvatarAsDataUrl(data.avatarUrl) : null;
    logShare('avatar', {
      traceId,
      gh: u,
      avatarMs: Date.now() - tAvatar,
      hasAvatarDataUrl: !!avatarDataUrl,
    });

    const img = new ImageResponse(
      <CodernetPortraitLongElement data={data} ghUsername={u} avatarDataUrl={avatarDataUrl} />,
      {
        width: SHARE_W,
        height: SHARE_H,
        fonts,
        headers: traceHeaders,
      },
    );
    logShare('image_response', { traceId, gh: u });
    return img;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logShare('error', { traceId, gh, message });
    console.error('[codernet-share-image] render failed', traceId, gh, err);
    return Response.json(
      {
        error: 'IMAGE_GENERATION_FAILED',
        message,
        traceId,
      },
      {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8', ...traceHeaders },
      },
    );
  }
}
