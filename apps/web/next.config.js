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
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      { source: '/plaza', destination: '/', permanent: true },
      { source: '/job-plaza', destination: '/', permanent: false },
      { source: '/job-plaza/:path*', destination: '/', permanent: false },
    ];
  },
  async rewrites() {
    const afterFiles = [];

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
