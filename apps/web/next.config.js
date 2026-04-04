/** @type {import('next').NextConfig} */
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
/** 本地子应用 @clawlive/vibekids（basePath=/vibekids）；生产可指向独立部署的 origin */
const vibekidsProxyOrigin = (process.env.VIBEKIDS_PROXY_ORIGIN || 'http://localhost:3002').replace(
  /\/$/,
  '',
);

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
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: '/vibekids',
          destination: `${vibekidsProxyOrigin}/vibekids`,
        },
        {
          source: '/vibekids/:path*',
          destination: `${vibekidsProxyOrigin}/vibekids/:path*`,
        },
        {
          source: '/uploads/:path*',
          destination: `${apiOrigin}/uploads/:path*`,
        },
        {
          source: '/api/:path*',
          destination: `${apiOrigin}/api/:path*`,
        },
      ],
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
