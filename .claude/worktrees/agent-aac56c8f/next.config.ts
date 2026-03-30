import type { NextConfig } from "next";

const BACKEND_PORT = process.env.SERVER_PORT || 4010;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${BACKEND_PORT}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `http://localhost:${BACKEND_PORT}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
