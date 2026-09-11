import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@coinbase/cdp-sdk', '@base-org/account'],
  turbopack: {
    resolveAlias: {
      '@x402/core/client': './lib/empty.ts',
      '@x402/evm/exact/client': './lib/empty.ts',
      '@x402/evm/upto/client': './lib/empty.ts',
      '@x402/svm/exact/client': './lib/empty.ts',
    },
  },
}

export default nextConfig
