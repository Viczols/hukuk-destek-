"use client";
import Image from "next/image";
import Link from "next/link";
import { BlogPost } from "../types/blog";

type Props = { post: BlogPost };

export default function BlogCard({ post }: Props) {
  return (
    <article
      className="group h-full flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md shadow-sm transition hover:bg-white/15"
    >
      {/* Kapak görseli */}
      <div className="relative aspect-[16/9]">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-zinc-400 bg-white/10">
            Kapak Görseli
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
      </div>

      {/* İçerik */}
      <div className="p-4 md:p-5 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-2 mb-3">
          {post.tags?.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-xs rounded-full px-2 py-1 bg-white/10 border border-white/15 backdrop-blur text-zinc-200"
            >
              {t}
            </span>
          ))}
        </div>

        <h3 className="text-lg md:text-xl font-semibold tracking-tight text-zinc-100 line-clamp-2">
          {post.title}
        </h3>

        <p className="mt-2 text-sm md:text-base text-zinc-300 line-clamp-3">
          {post.excerpt}
        </p>

        {/* Footer: her zaman altta */}
        <div className="mt-auto pt-4 flex items-center justify-between">
          <time dateTime={post.publishedAt?.toString()} className="text-xs text-zinc-400">
            {post.publishedAtText}
          </time>
 <Link href={`/blog/${post.slug}/`} className="text-sm font-medium rounded-full px-3 py-1.5 bg-white text-black hover:bg-zinc-200 transition">
            Devamını Oku
          </Link>
        </div>
      </div>
    </article>
  );
}
