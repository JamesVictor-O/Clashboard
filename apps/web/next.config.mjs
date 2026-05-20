/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Three.js must run client-side only
    serverComponentsExternalPackages: ["three", "@react-three/fiber"],
  },
  webpack: (config, { isServer }) => {
    // Prevent Three.js from being bundled on the server
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "three",
        "@react-three/fiber",
      ];
    }
    return config;
  },
};

export default nextConfig;
