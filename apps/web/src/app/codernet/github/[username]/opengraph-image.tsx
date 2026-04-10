import { ImageResponse } from 'next/og';
import { fetchCodernetPortraitForShare } from '@/lib/codernet-portrait-share';
import { CodernetPortraitOgElement } from '@/lib/codernet-portrait-share-jsx';

export const runtime = 'edge';
export const alt = 'GITLINK 开发者画像';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

export default async function Image({ params }: { params: { username: string } }) {
  const gh = decodeURIComponent(params.username);
  const data = await fetchCodernetPortraitForShare(gh);
  const u = (data?.ghUsername || gh).toLowerCase();

  return new ImageResponse(<CodernetPortraitOgElement data={data} ghUsername={u} />, {
    width: 1200,
    height: 630,
  });
}
