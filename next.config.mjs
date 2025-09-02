// next.config.mjs
/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  // Statik export
  output: "export",

  // Hosting’te /blog/slug/ → index.html uyumu için
  trailingSlash: true,

  images: {
    // Export modunda optimize edilmediği için:
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },

  async rewrites() {
    // Blog tek sayfa yönlendirmeleri
    const blogRewrites = [
      { source: "/blog/:slug", destination: "/blog" },
      { source: "/blog/:slug*/:rest*", destination: "/blog" },
    ];

    if (isDev) {
      // DEV: SADECE blogUpload'ı Cloud Functions'a yönlendir.
      // Böylece diğer /api/** uçları (ör. PDF upload) Next API route olarak çalışmaya devam eder.
      return {
        beforeFiles: [
          {
            source: "/api/blogUpload",
            destination:
              "https://europe-west1-dilekce-destek.cloudfunctions.net/api/blogUpload",
          },
          {
            // bazı yerlerde /api/blogUpload/ şeklinde çağrıldığı için
            source: "/api/blogUpload/",
            destination:
              "https://europe-west1-dilekce-destek.cloudfunctions.net/api/blogUpload",
          },
          ...blogRewrites,
        ],
        afterFiles: [],
        fallback: [],
      };
    }

    // PROD: API yönlendirmelerini Firebase Hosting (firebase.json) yapıyor.
    // Burada sadece blog yönlendirmeleri kalsın.
    return blogRewrites;
  },
};

export default nextConfig;
