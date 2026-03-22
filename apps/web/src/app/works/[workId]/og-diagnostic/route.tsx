/**
 * 诊断用：纯静态 ImageResponse，仅使用 params，无任何 API 调用
 * 用于隔离变量：若此路由返回有效图片，则问题在 API fetch；若返回 0 字节，则问题在动态段
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { workId: string } }
) {
  const workId = params.workId;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #d81b60, #ec407a)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 48,
          color: 'white',
        }}
      >
        Diagnostic: {workId}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
