import { ImageResponse } from 'next/og';
import { fetchCodernetPortraitForShare } from '@/lib/codernet-portrait-share';
import { CodernetPortraitOgElement } from '@/lib/codernet-portrait-share-jsx';
import { fetchAvatarAsDataUrl } from '@/lib/codernet-portrait-avatar-data-url';
import { loadNotoSansScFontsForOg } from '@/lib/og-noto-sans-sc';

export const runtime = 'edge';
export const alt = 'GITLINK 开发者画像';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

export default async function Image({ params }: { params: { username: string } }) {
  const gh = decodeURIComponent(params.username);
  const [data, fonts] = await Promise.all([
    fetchCodernetPortraitForShare(gh),
    loadNotoSansScFontsForOg(),
  ]);
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
      },
    },
  );
}
