import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output — Render runs `node .next/standalone/server.js`
  // This bundles only the files needed to run, cutting deploy size dramatically.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
