/**
 * 视频代理：从后端拉取视频并流式返回，彻底解决跨域、CORS、URL 配置问题
 * 使用方式：/api/video-proxy?path=/uploads/works/xxx/file.webm
 */
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');
  if (!path || !path.startsWith('/uploads/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // 生产环境必须配置正确的后端地址（Vercel 部署时 NEXT_PUBLIC_API_URL 需指向 Railway）
  if (process.env.VERCEL && (!API_URL || API_URL.includes('localhost'))) {
    console.error('[video-proxy] NEXT_PUBLIC_API_URL not configured for production');
    return NextResponse.json(
      { error: 'Video proxy misconfigured: set NEXT_PUBLIC_API_URL in Vercel to your Railway backend URL' },
      { status: 503 }
    );
  }

  const backendUrl = `${API_URL.replace(/\/$/, '')}${path}`;
  const rangeHeader = request.headers.get('range');
  const fetchHeaders: HeadersInit = {};
  if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

  try {
    const res = await fetch(backendUrl, { headers: fetchHeaders });

    if (!res.ok) {
      return NextResponse.json({ error: 'Video not found' }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'video/webm';
    const contentLength = res.headers.get('content-length');
    const acceptRanges = res.headers.get('accept-ranges');

    const headers = new Headers();
    headers.set('content-type', contentType);
    if (contentLength) headers.set('content-length', contentLength);
    if (acceptRanges) headers.set('accept-ranges', acceptRanges);
    const range = res.headers.get('content-range');
    if (range) headers.set('content-range', range);

    return new NextResponse(res.body, {
      status: res.status,
      headers,
    });
  } catch (err) {
    console.error('[video-proxy]', err);
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 });
  }
}
