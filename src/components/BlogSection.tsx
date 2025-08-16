// src/components/BlogSection.tsx
"use client";
import { useMemo, useState } from "react";
import BlogCard from "./BlogCard";
import { BlogPost } from "../types/blog";

type Props = {
  posts: BlogPost[];            // dışarıdan Firestore ya da mock verisi gelebilir
  initialLimit?: number;        // başlangıçta kaç kart gösterilsin
  title?: string;
};

export default function BlogSection({ posts, initialLimit = 6, title = "Blog" }: Props) {
  const [query, setQuery] = useState("");
  const allTags = useMemo(
    () => Array.from(new Set(posts.flatMap((p) => p.tags || []))),
    [posts]
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [limit, setLimit] = useState(initialLimit);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const matchText =
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q);
      const matchTag = activeTag ? p.tags?.includes(activeTag) : true;
      return matchText && matchTag;
    });
  }, [posts, query, activeTag]);

  const visible = filtered.slice(0, limit);
  const canLoadMore = filtered.length > visible.length;

  return (
    <section id="blog" className="relative py-12 md:py-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-end gap-4 md:gap-6">
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h2>
            <p className="text-zinc-600 mt-1">Güncel hukuki içerikler, pratik öneriler ve duyurular.</p>
          </div>

          <div className="flex-1 flex items-center gap-2 md:justify-end">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTag(null)}
                className={`text-sm rounded-full px-3 py-1.5 border ${!activeTag ? "bg-zinc-900 text-white border-zinc-900" : "bg-white/70 backdrop-blur border-zinc-200 hover:bg-white"}`}
              >
                Hepsi
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag((prev) => (prev === t ? null : t))}
                  className={`text-sm rounded-full px-3 py-1.5 border ${activeTag === t ? "bg-zinc-900 text-white border-zinc-900" : "bg-white/70 backdrop-blur border-zinc-200 hover:bg-white"}`}
                >
                  #{t}
                </button>
              ))}
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara..."
              className="ml-auto w-40 md:w-56 rounded-xl border border-zinc-200 bg-white/60 backdrop-blur px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {visible.map((p) => (
            <BlogCard key={p.id} post={p} />
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          {canLoadMore ? (
            <button
              onClick={() => setLimit((n) => n + initialLimit)}
              className="rounded-full px-4 py-2 bg-zinc-900 text-white hover:bg-zinc-700 transition"
            >
              Daha Fazla Yükle
            </button>
          ) : filtered.length === 0 ? (
            <div className="text-zinc-500">Eşleşen yazı bulunamadı.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
