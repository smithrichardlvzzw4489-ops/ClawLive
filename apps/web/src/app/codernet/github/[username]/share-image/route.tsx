import { ImageResponse } from 'next/og';
import { fetchCodernetPortraitForShare } from '@/lib/codernet-portrait-share';
import { CodernetPortraitLongElement } from '@/lib/codernet-portrait-share-jsx';

/** Node 运行时：Edge 上大尺寸 ImageResponse 易出现空响应；与 Satori 更稳 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 过高画布在部分环境会渲染失败，2000 仍可覆盖长图内容 */
const SHARE_W = 1200;
const SHARE_H = 2000;

/**
 * 长图 PNG：下载或带图分享。路径：/codernet/github/:user/share-image
 */
export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const gh = decodeURIComponent(params.username);
  try {
    const data = await fetchCodernetPortraitForShare(gh);
    const u = (data?.ghUsername || gh).toLowerCase();

    return new ImageResponse(
      <CodernetPortraitLongElement data={data} ghUsername={u} />,
      {
        width: SHARE_W,
        height: SHARE_H,
      },
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
