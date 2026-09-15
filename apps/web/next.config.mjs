/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  transpilePackages: ['@camefa/engine-contracts'],
  experimental: { typedRoutes: true },
  env: { GATEWAY_URL: process.env.GATEWAY_URL ?? 'http://localhost:3000' },
};
