import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Root Directory set to apps/api in Vercel — no distDir hack needed
  serverExternalPackages: ['pg'],
  transpilePackages: [
    '@reach/shared-types',
    '@reach/rules-engine',
    '@reach/ai-checks',
  ],
  // CORS lives in middleware.ts (extension-origin allowlist, not '*').
};

export default nextConfig;
