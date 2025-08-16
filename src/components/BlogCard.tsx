// src/components/BlogCard.tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { BlogPost } from "../types/blog";

type Props = {
  post: BlogPost;
};

export default function BlogCard({ post }: Props) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-white/40 bg-white/40 backdrop-blur-md shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/9]">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-zinc-400 bg-white/50">Kapak Görseli</div>
        )}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/30 rounded-2xl" />
      </div>

      <div className="p-4 md:p-5">
        <div className="flex flex-wrap gap-2 mb-3">
          {post.tags?.slice(0, 3).map((t) => (
            <span key={t} className="text-xs rounded-full px-2 py-1 bg-white/70 border border-white/50 backdrop-blur">
              #{t}
            </span>
          ))}
        </div>

        <h3 className="text-lg md:text-xl font-semibold tracking-tight text-zinc-900 line-clamp-2">
          {post.title}
        </h3>

        <p className="mt-2 text-sm md:text-base text-zinc-700 line-clamp-3">{post.excerpt}</p>

        <div className="mt-4 flex items-center justify-between">
          <time dateTime={post.publishedAt?.toString()} className="text-xs text-zinc-500">
            {post.publishedAtText}
          </time>
          <Link
            href={`/blog/${post.slug}`}
            className="text-sm font-medium rounded-full px-3 py-1.5 bg-zinc-900 text-white hover:bg-zinc-700 transition"
          >
            Devamını Oku
          </Link>
        </div>
      </div>
    </article>
  );
}
