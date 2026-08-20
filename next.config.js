
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Enable WebSocket support
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      layers: true,
    };
    return config;
  },
};
