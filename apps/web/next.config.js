/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
/** 本地子应用 @clawlive/vibekids（basePath=/vibekids）；生产须为公网 https origin */
const vibekidsProxyOrigin = (process.env.VIBEKIDS_PROXY_ORIGIN || 'http://localhost:3002').replace(
  /\/$/,
  '',
);

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

    if (allowOutboundProxy(vibekidsProxyOrigin)) {
      afterFiles.push(
        { source: '/vibekids', destination: `${vibekidsProxyOrigin}/vibekids` },
        { source: '/vibekids/:path*', destination: `${vibekidsProxyOrigin}/vibekids/:path*` },
      );
    }

    if (allowOutboundProxy(apiOrigin)) {
      afterFiles.push(
        { source: '/uploads/:path*', destination: `${apiOrigin}/uploads/:path*` },
        { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
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
