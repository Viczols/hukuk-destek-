// src/app/blog/page.tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BlogPostClient from "./_slug.bak/BlogPostClient";

export default function BlogPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[50vh] flex items-center justify-center">
          <p className="text-sm text-zinc-600">Yazı yükleniyor…</p>
        </main>
      }
    >
      <BlogPageInner />
    </Suspense>
  );
}

function BlogPageInner() {
  const search = useSearchParams();
  const slug = search?.get("slug") || "";

  if (!slug) {
    return (
      <main className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-zinc-600">Yazı seçiniz…</p>
      </main>
    );
  }

  return <BlogPostClient key={slug} slug={slug} />;
}
