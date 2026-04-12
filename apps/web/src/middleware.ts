import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const showLive = process.env.NEXT_PUBLIC_SHOW_LIVE_FEATURES === 'true';

/** 运行时反代到 Railway 等后端；无需写进客户端 bundle（可与 NEXT_PUBLIC_API_URL 二选一或并存）。 */
function getBackendBase(): string | null {
  const raw = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  return t ? t.replace(/\/$/, '') : null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const search = request.nextUrl.search;

  const backend = getBackendBase();
  if (backend) {
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/video-proxy')) {
      try {
        return NextResponse.rewrite(new URL(`${backend}${pathname}${search}`));
      } catch {
        /* fall through */
      }
    }
    if (pathname.startsWith('/uploads/')) {
      try {
        return NextResponse.rewrite(new URL(`${backend}${pathname}${search}`));
      } catch {
        /* fall through */
      }
    }
  }

  if (showLive) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/uploads/:path*',
    '/rooms/:path*',
    '/dashboard',
    '/my-streams',
    '/history/:path*',
  ],
};
