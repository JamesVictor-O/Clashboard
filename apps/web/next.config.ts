import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["three"],
  },
  webpack: (config) => {
    // Support for Three.js
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
