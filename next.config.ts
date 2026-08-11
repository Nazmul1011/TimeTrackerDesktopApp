import type { NextConfig } from "next";

/**
 * Next.js configuration for the Electron renderer process.
 * output: 'export' is avoided so App Router API routes remain available later.
 * In Electron production builds, the app is served from the Next standalone/static output.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Allow absolute imports via tsconfig paths
  experimental: {},
};

export default nextConfig;
