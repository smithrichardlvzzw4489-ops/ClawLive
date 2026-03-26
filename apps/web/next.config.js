/** @type {import('next').NextConfig} */
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@clawlive/shared-types'],
  output: 'standalone',
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
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
