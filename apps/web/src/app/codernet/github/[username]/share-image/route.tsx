import { ImageResponse } from 'next/og';
import { fetchCodernetPortraitForShare } from '@/lib/codernet-portrait-share';
import { CodernetPortraitLongElement } from '@/lib/codernet-portrait-share-jsx';

export const runtime = 'edge';
export const revalidate = 300;

/**
 * 长图 PNG：下载或带图分享。路径：/codernet/github/:user/share-image
 */
export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const gh = decodeURIComponent(params.username);
  const data = await fetchCodernetPortraitForShare(gh);
  const u = (data?.ghUsername || gh).toLowerCase();

  return new ImageResponse(<CodernetPortraitLongElement data={data} ghUsername={u} />, {
    width: 1200,
    height: 2800,
  });
}
