import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Root Directory set to apps/api in Vercel — no distDir hack needed
  serverExternalPackages: ['pg'],
  transpilePackages: [
    '@reach/shared-types',
    '@reach/rules-engine',
    '@reach/ai-checks',
  ],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
