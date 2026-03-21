import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@reach/shared-types',
    '@reach/rules-engine',
    '@reach/ai-checks',
  ],
};

export default nextConfig;
