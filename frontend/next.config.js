/** @type {import('next').NextConfig} */
// 后端默认端口：优先环境变量 BACKEND_PORT / NEXT_PUBLIC_API_BASE，否则 8000。
// 若本机 8000 被其他进程占用（常见于多项目），可设 BACKEND_PORT=8001。
const backendOrigin = (
  process.env.NEXT_PUBLIC_API_BASE ||
  `http://127.0.0.1:${process.env.BACKEND_PORT || "8000"}`
).replace(/\/+$/, "");

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${backendOrigin}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
