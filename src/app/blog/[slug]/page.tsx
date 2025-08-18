// src/app/blog/[slug]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";
import { BlogPost } from "../../../types/blog";

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const db = getFirestore();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [others, setOthers] = useState<BlogPost[]>([]);
  const slug = params.slug;

  useEffect(() => {
    (async () => {
      // esas yazı
      const q1 = query(collection(db, "posts"), where("slug", "==", slug), limit(1));
      const s1 = await getDocs(q1);
      if (!s1.empty) {
        const d = s1.docs[0];
        const data = d.data() as any;
        const publishedAtText = data.publishedAt
          ? new Intl.RelativeTimeFormat("tr", { numeric: "auto" }).format(
              Math.round((data.publishedAt - Date.now()) / (1000 * 60 * 60 * 24)),
              "day"
            )
          : "";
        setPost({ id: d.id, ...data, publishedAtText });
      } else {
        setPost(null);
      }

      // diğerleri
      const q2 = query(
        collection(db, "posts"),
        where("status", "==", "published"),
        orderBy("publishedAt", "desc"),
        limit(6)
      );
      const s2 = await getDocs(q2);
      const list = s2.docs
        .filter((x) => x.data().slug !== slug)
        .map((d) => {
          const data = d.data() as any;
          const publishedAtText = data.publishedAt
            ? new Intl.RelativeTimeFormat("tr", { numeric: "auto" }).format(
                Math.round((data.publishedAt - Date.now()) / (1000 * 60 * 60 * 24)),
                "day"
              )
            : "";
          return { id: d.id, ...data, publishedAtText } as BlogPost;
        });
      setOthers(list);
    })();
  }, [db, slug]);

  if (!post) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-900 text-zinc-100">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-2xl font-semibold">Yazı bulunamadı</h1>
          <p className="text-zinc-400 mt-2">Aradığınız yazı kaldırılmış ya da taşınmış olabilir.</p>
          <Link href="/#blog" className="mt-6 inline-block rounded-full bg-white text-zinc-900 px-4 py-2 hover:bg-zinc-200 transition">
            Blog’a dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-900 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <div className="grid md:grid-cols-[2fr_1fr] gap-8 lg:gap-12">
          <article>
            <Link href="/#blog" className="text-sm text-zinc-400 hover:text-zinc-200 transition">
              ← Blog’a dön
            </Link>

            <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-white">
              {post.title}
            </h1>
            <div className="mt-2 text-sm text-zinc-400">{post.publishedAtText}</div>

            {post.coverUrl && (
              <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                <Image src={post.coverUrl} alt={post.title} fill className="object-cover" />
              </div>
            )}

            {post.tags?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs rounded-full px-2 py-1 bg-white/10 border border-white/15 backdrop-blur text-zinc-200"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            <article className="prose prose-invert prose-zinc max-w-none mt-6 whitespace-pre-wrap">
              {post.content}
            </article>
          </article>

          <aside className="md:sticky md:top-24 h-max">
            <h3 className="text-lg font-semibold mb-3 text-white">Diğer Yazılar</h3>
            <div className="space-y-3">
              {others.map((p) => (
                <Link
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  className="flex gap-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur hover:bg-white/10 transition p-2"
                >
                  <div className="relative w-20 h-14 shrink-0 overflow-hidden rounded-lg">
                    {p.coverUrl ? (
                      <Image src={p.coverUrl} alt={p.title} fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-zinc-400">—</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100 line-clamp-2">{p.title}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{p.publishedAtText}</div>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
