"use client";
import { useMemo, useState } from "react";
import BlogCard from "./BlogCard";
import { BlogPost } from "../types/blog";

type Props = {
  posts: BlogPost[];
  initialLimit?: number;
  title?: string;
};

export default function BlogSection({
  posts,
  initialLimit = 6,
  title = "Blog",
}: Props) {
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
      className="relative w-full overflow-hidden py-16 md:py-20 text-zinc-100 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-900"
    >
      {/* container */}
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        {/* header */}
        <div className="mb-6 md:mb-8 flex min-w-0 flex-col gap-4 md:gap-5">
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-1 text-zinc-300">
              Güncel hukuki içerikler, pratik öneriler ve duyurular.
            </p>
          </div>

          {/* tags + search row */}
          <div className="flex min-w-0 items-center gap-3">
            {/* TAGS: md ve altı yatay scroll, xl+ wrap */}
            <div className="no-scrollbar -mx-1 flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto px-1 xl:flex-wrap xl:overflow-visible xl:gap-y-2">
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

              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setActiveTag((prev) => (prev === t ? null : t))
                  }
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

            {/* SEARCH: sabit genişlik, shrink yok */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara..."
              className="ml-auto w-40 sm:w-52 md:w-56 shrink-0 rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-400 backdrop-blur px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
        </div>

        {/* cards grid – geniş ekranlarda da 3 sütun */}
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3">
          {visible.map((p) => (
            <BlogCard key={p.id} post={p} />
          ))}
        </div>

        {/* load more / empty */}
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
