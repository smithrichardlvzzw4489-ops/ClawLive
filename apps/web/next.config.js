/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Vercel 边缘禁止把流量代理到 localhost/私有解析，否则会报 DNS_HOSTNAME_RESOLVED_PRIVATE */
function allowOutboundProxy(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return !isVercel;
    }
    return true;
  } catch {
    return false;
  }
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@clawlive/shared-types'],
  output: 'standalone',
  /** Monorepo 中 vibekids 会提升 eslint@9；与 eslint-config-next@14 不兼容，易触发 ESLint 序列化循环引用 */
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      { source: '/plaza', destination: '/lab', permanent: true },
    ];
  },
  async rewrites() {
    const afterFiles = [];

    if (allowOutboundProxy(apiOrigin)) {
      afterFiles.push(
        { source: '/uploads/:path*', destination: `${apiOrigin}/uploads/:path*` },
        // VibeKids 作品持久化在 Railway PostgreSQL（Express）；generate/credits/diag 等仍走 Next
        { source: '/api/vibekids/works', destination: `${apiOrigin}/api/vibekids/works` },
        {
          source: '/api/vibekids/works/:path*',
          destination: `${apiOrigin}/api/vibekids/works/:path*`,
        },
        {
          source: '/api/:path((?!vibekids).*)',
          destination: `${apiOrigin}/api/:path`,
        },
      );
    }

    return {
      beforeFiles: [],
      afterFiles,
      fallback: [],
    };
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
};

module.exports = nextConfig;
