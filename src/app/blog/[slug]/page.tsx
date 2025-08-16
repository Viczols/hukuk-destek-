// src/app/blog/[slug]/page.tsx
import Image from "next/image";
import Link from "next/link";

const POSTS = [
  {
    slug: "is-akdinde-fesih-sureci",
    title: "İş Akdinde Fesih Süreci: Dikkat Edilmesi Gerekenler",
    coverUrl: "/images/istockphoto-1328608958-612x612.jpg",
    publishedAtText: "2 gün önce",
    content: `İş akdi fesih sürecinde işveren ve işçinin hakları, süreler ve tazminatlar...`,
    tags: ["iş-hukuku", "fesih"],
  },
  {
    slug: "kira-uyusmazliklarinda-yeni-yol-haritasi",
    title: "Kira Uyuşmazlıklarında Yeni Yol Haritası",
    coverUrl: "/images/ChatGPT Image 15 Ağu 2025 16_18_37.png",
    publishedAtText: "1 hafta önce",
    content: `Arabuluculuk şartı, tahliye davası, kira tespiti ve pratik öneriler...`,
    tags: ["gayrimenkul", "arabuluculuk"],
  },
  {
    slug: "miras-planlamasi-icin-ipuclari",
    title: "Miras Planlaması İçin 7 İpucu",
    coverUrl: "/images/ChatGPT Image 15 Ağu 2025 16_15_57.png",
    publishedAtText: "12 gün önce",
    content: `Vasiyetname, saklı pay, miras sözleşmesi… Hangi adımlar riski azaltır?`,
    tags: ["miras", "aile-hukuku"],
  },
];

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = POSTS.find((p) => p.slug === params.slug);
  const others = POSTS.filter((p) => p.slug !== params.slug);

  if (!post) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold">Yazı bulunamadı</h1>
        <p className="text-zinc-600 mt-2">Aradığınız yazı kaldırılmış ya da taşınmış olabilir.</p>
        <Link href="/#blog" className="mt-6 inline-block rounded-full bg-zinc-900 text-white px-4 py-2 hover:bg-zinc-700">
          Blog’a dön
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="grid md:grid-cols-[2fr_1fr] gap-8 lg:gap-12">
        {/* SOL: içerik */}
        <article>
          <Link href="/#blog" className="text-sm text-zinc-600 hover:underline">← Blog’a dön</Link>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">{post.title}</h1>
          <div className="mt-2 text-sm text-zinc-500">{post.publishedAtText}</div>

          {post.coverUrl && (
            <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl border border-white/40 bg-white/40 backdrop-blur">
              <Image src={post.coverUrl} alt={post.title} fill className="object-cover" />
            </div>
          )}

          {post.tags?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <span key={t} className="text-xs rounded-full px-2 py-1 bg-white/70 border border-white/50 backdrop-blur">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}

          <div className="prose prose-zinc max-w-none mt-6">
            {post.content.split("\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </article>

        {/* SAĞ: diğer yazılar (sticky) */}
        <aside className="md:sticky md:top-24 h-max">
          <h3 className="text-lg font-semibold mb-3">Diğer Yazılar</h3>
          <div className="space-y-3">
            {others.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="flex gap-3 rounded-xl border border-white/50 bg-white/60 backdrop-blur hover:bg-white transition p-2"
              >
                <div className="relative w-20 h-14 shrink-0 overflow-hidden rounded-lg">
                  {p.coverUrl ? (
                    <Image src={p.coverUrl} alt={p.title} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-zinc-400">—</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900 line-clamp-2">{p.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{p.publishedAtText}</div>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
