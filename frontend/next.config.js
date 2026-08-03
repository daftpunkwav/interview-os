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

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=()",
  },
  // 宽松 CSP：允许 TalkingHead / Three / 同源 API；禁止默认外联脚本
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // blob:：GLTF 内嵌贴图经 ImageBitmapLoader.fetch；https:：远端贴图 URI
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // blob:：Three 贴图 fetch(blob:)；否则女模白模
      "connect-src 'self' http: https: ws: wss: blob:",
      // data:：TTS 使用 data:audio/mpeg;base64,...
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  transpilePackages: ["@met4citizen/talkinghead", "three"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // 本地人像 GLB 长期缓存（文件名变更即换址）
        source: "/avatars/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
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
