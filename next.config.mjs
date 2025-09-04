// next.config.mjs
/** @type {import('next').NextConfig} */

// DEV: next dev çalışırken localde /blog/:slug ve /panel/* için rewrite gerekiyor.
// PROD (build/export): "out/" üretilecek, rewrites'ı HOSTING (firebase.json) yapacak.
const isDev = process.env.NODE_ENV !== "production";

const devOnlyRewrites = async () => [
  { source: "/blog/:slug*", destination: "/blog" },
  { source: "/panel/:path*", destination: "/panel" },
];

const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  ...(isDev
    ? { rewrites: devOnlyRewrites } // ✅ sadece development'ta rewrites
    : { output: "export" } // ✅ production'da out/ üret
  ),
};

export default nextConfig;
