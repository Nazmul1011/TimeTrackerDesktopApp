import type { NextConfig } from "next";

/**
 * Next.js configuration for the Electron renderer process.
 * Static export is required so packaged Electron can serve the UI without a Node Next server.
 */
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  experimental: {},
};

export default nextConfig;
