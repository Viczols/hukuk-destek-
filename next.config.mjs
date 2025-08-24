/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",               // statik export için gerekli
  trailingSlash: true,            // /blog/slug/ -> index.html uyumu
  images: {
    unoptimized: true,            // sunucu olmadığı için optimize edilmez
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
