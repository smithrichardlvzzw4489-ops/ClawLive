import { ImageResponse } from 'next/og';
import {
  CODENET_SHARE_TRACE_HEADER,
  fetchCodernetPortraitForShareWithMeta,
} from '@/lib/codernet-portrait-share';
import { CodernetPortraitOgElement } from '@/lib/codernet-portrait-share-jsx';
import { fetchAvatarAsDataUrl } from '@/lib/codernet-portrait-avatar-data-url';
import { loadNotoSansScFontsForOg } from '@/lib/og-noto-sans-sc';

export const runtime = 'edge';
export const alt = 'GITLINK 开发者画像';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

export default async function Image({ params }: { params: { username: string } }) {
  const traceId = crypto.randomUUID();
  const gh = decodeURIComponent(params.username);
  try {
    const tParallel = Date.now();
    const [{ data, meta: profileMeta }, fonts] = await Promise.all([
      fetchCodernetPortraitForShareWithMeta(gh, { traceId }),
      loadNotoSansScFontsForOg(),
    ]);
    console.log(
      `[codernet-opengraph-image] profile+fonts ${JSON.stringify({
        traceId,
        gh,
        parallelWallMs: Date.now() - tParallel,
        profileApiMs: profileMeta.durationMs,
        profileHttp: profileMeta.httpStatus,
        profileJsonStatus: profileMeta.jsonStatus ?? null,
        hasData: !!data,
        fontsCount: fonts.length,
      })}`,
    );

    const u = (data?.ghUsername || gh).toLowerCase();
    const avatarDataUrl = data?.avatarUrl ? await fetchAvatarAsDataUrl(data.avatarUrl) : null;

    return new ImageResponse(
      <CodernetPortraitOgElement data={data} ghUsername={u} avatarDataUrl={avatarDataUrl} />,
      {
        width: 1200,
        height: 630,
        fonts,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          [CODENET_SHARE_TRACE_HEADER]: traceId,
        },
      },
    );
  } catch (err) {
    console.error('[codernet-opengraph-image] failed', traceId, gh, err);
    throw err;
  }
}
