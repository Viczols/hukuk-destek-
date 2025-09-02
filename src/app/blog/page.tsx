// src/app/blog/page.tsx
"use client";

import { useEffect, useState } from "react";
// BlogPostClient dosyanın gerçek konumuna göre İKİNDEN BİRİNİ kullan:
import BlogPostClient from "./_slug.bak/BlogPostClient";
// Eğer sende _slug.bak altında ise üst satırı sil, bunu aç:
// import BlogPostClient from "./_slug.bak/BlogPostClient";

export default function BlogPage() {
  const [slug, setSlug] = useState<string>("");

  useEffect(() => {
    // URL: /blog/<slug>[/] → <slug>
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/blog";
    let s = pathname.replace(/^\/+/, ""); // baştaki /'lar
    s = s.replace(/^blog\/?/, "");       // baştaki "blog/"
    s = s.replace(/\/+$/, "");           // sondaki /'lar
    setSlug(decodeURIComponent(s));
  }, []);

  if (!slug) {
    // İlk render (export HTML) + mount anında kısa bir yükleniyor durumu
    return (
      <main className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-zinc-600">Yazı yükleniyor…</p>
      </main>
    );
  }

  return <BlogPostClient slug={slug} />;
}
