import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const showLive = process.env.NEXT_PUBLIC_SHOW_LIVE_FEATURES === 'true';

/** 独立站时期的路径；合并进主站后统一到 /vibekids/*，保留 query（如 ?age=primary） */
const LEGACY_VIBEKIDS = new Set(['/studio', '/feed', '/gallery', '/cases']);

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (LEGACY_VIBEKIDS.has(path)) {
    const url = request.nextUrl.clone();
    url.pathname = `/vibekids${path}`;
    return NextResponse.redirect(url);
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
    '/rooms/:path*',
    '/dashboard',
    '/my-streams',
    '/history/:path*',
    '/studio',
    '/feed',
    '/gallery',
    '/cases',
  ],
};
