"use client";
import { useMemo, useState } from "react";
import BlogCard from "./BlogCard";
import { BlogPost } from "../types/blog";

type Props = {
  posts: BlogPost[];
  initialLimit?: number;
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
    <section
      id="blog"
      className="relative py-16 md:py-20 text-zinc-100 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-900"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-end gap-4 md:gap-6">
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">{title}</h2>
            <p className="text-zinc-300 mt-1">Güncel hukuki içerikler, pratik öneriler ve duyurular.</p>
          </div>

          <div className="flex-1 flex items-center gap-2 md:justify-end">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {/* Hepsi */}
              <button
                onClick={() => setActiveTag(null)}
                className={`text-sm rounded-full px-3 py-1.5 border transition-colors ${
                  !activeTag
                    ? "bg-white text-zinc-900 border-white"
                    : "bg-white/10 border-white/15 text-zinc-200 hover:bg-white/15"
                }`}
              >
                Hepsi
              </button>

              {/* Etiketler – # kaldırıldı ve palet koyulaştırıldı */}
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag((prev) => (prev === t ? null : t))}
                  className={`text-sm rounded-full px-3 py-1.5 border transition-colors ${
                    activeTag === t
                      ? "bg-white text-zinc-900 border-white"
                      : "bg-white/10 border-white/15 text-zinc-200 hover:bg-white/15"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Arama – koyu zeme uygun */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara..."
              className="ml-auto w-40 md:w-56 rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-400 backdrop-blur px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
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
