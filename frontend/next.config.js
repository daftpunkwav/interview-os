/** @type {import('next').NextConfig} */
// 后端默认端口：优先环境变量 BACKEND_PORT / NEXT_PUBLIC_API_BASE，否则 8000。
// 若本机 8000 被其他进程占用（常见于多项目），可设 BACKEND_PORT=8001。
const backendOrigin = (
  process.env.NEXT_PUBLIC_API_BASE ||
  `http://127.0.0.1:${process.env.BACKEND_PORT || "8000"}`
).replace(/\/+$/, "");

// 启动时打印，便于确认 rewrite 目标端口（避免指到被占用的 8000）
if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.info(`[next.config] API rewrite → ${backendOrigin}`);
}

const nextConfig = {
  transpilePackages: ["@met4citizen/talkinghead", "three"],
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
