import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@ghost/protocol",
    "@ghost/crypto",
    "@ghost/webrtc",
    "@ghost/storage",
  ],
};

export default nextConfig;
