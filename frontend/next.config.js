/** @type {import('next').NextConfig} */
// 后端默认端口：优先环境变量 BACKEND_PORT / NEXT_PUBLIC_API_BASE，否则 8000。
const backendOrigin = (
  process.env.NEXT_PUBLIC_API_BASE ||
  `http://127.0.0.1:${process.env.BACKEND_PORT || "8000"}`
).replace(/\/+$/, "");

const wsOrigin = (
  process.env.NEXT_PUBLIC_WS_URL ||
  backendOrigin.replace(/^http/, "ws")
).replace(/\/+$/, "");

const streamOrigin = (
  process.env.NEXT_PUBLIC_STREAM_API_BASE || backendOrigin
).replace(/\/+$/, "");

function originHost(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const connectSrc = [
  "'self'",
  originHost(backendOrigin),
  originHost(streamOrigin),
  originHost(wsOrigin),
  // TalkingHead / Three 可能 fetch blob 贴图
  "blob:",
]
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i)
  .join(" ");

// 启动时打印，便于确认 rewrite 目标端口
if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.info(`[next.config] API rewrite → ${backendOrigin}; connect-src hosts locked`);
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=()",
  },
  // CSP：收紧 connect-src；TalkingHead/Three 仍需 unsafe-eval
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // unsafe-eval：TalkingHead / Three 运行时需要；unsafe-inline：主题初始化脚本
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig = {
  transpilePackages: ["@met4citizen/talkinghead", "three"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
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
