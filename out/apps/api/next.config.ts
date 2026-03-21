import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.VERCEL ? '../../.next' : '.next',
  transpilePackages: [
    '@reach/shared-types',
    '@reach/rules-engine',
    '@reach/ai-checks',
  ],
};

export default nextConfig;
