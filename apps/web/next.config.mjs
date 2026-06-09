/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Three.js must run client-side only
    serverComponentsExternalPackages: ["three", "@react-three/fiber"],
  },
  webpack: (config, { isServer }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules\/ox\/_esm\/tempo\/internal\/virtualMasterPool\.js/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

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
