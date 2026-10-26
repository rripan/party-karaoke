import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The floating dev badge sits on top of the guest bottom navigation.
  devIndicators: false,
  // Phones on the local network open the dev server by IP address.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // YouTube's embedded player requires a referrer (origin is enough).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), autoplay=(self \"https://www.youtube.com\" \"https://www.youtube-nocookie.com\"), fullscreen=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
