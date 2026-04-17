/** @type {import('next').NextConfig} */
const isVercel = Boolean(process.env.VERCEL);

/** 与 `src/lib/api.ts` 对齐：反代目标优先 BACKEND_URL（可仅服务端），否则 NEXT_PUBLIC_API_URL */
const apiOrigin = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');

if (isVercel && !process.env.NEXT_PUBLIC_API_URL && !process.env.BACKEND_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[next.config] Vercel: 未设置 BACKEND_URL 或 NEXT_PUBLIC_API_URL；/api、/uploads 将无法反代到 Railway，请在项目环境变量中配置至少其一（公网 https 根地址，无尾斜杠）后重新部署。',
  );
}

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
