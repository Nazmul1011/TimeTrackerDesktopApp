import type { NextConfig } from "next";

/**
 * Next.js configuration for the Electron renderer.
 * Static export is packaged into the .dmg and served on 127.0.0.1.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  experimental: {},
};

export default nextConfig;
