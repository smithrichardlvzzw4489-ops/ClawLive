import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const showLive = process.env.NEXT_PUBLIC_SHOW_LIVE_FEATURES === 'true';

export function middleware(request: NextRequest) {
  if (showLive) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = '/jobs';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/rooms/:path*', '/dashboard', '/my-streams', '/history/:path*'],
};
