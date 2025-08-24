// src/pages/blog/[slug].tsx
import type { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import Head from "next/head";
import Link from "next/link";

type Props = { slug: string };

export default function BlogSlugPage({ slug }: InferGetStaticPropsType<typeof getStaticProps>) {
  // İstersen burada client bileşenini kullan:
  // return <BlogPostClient slug={slug} />;
  return (
    <>
      <Head><title>Blog</title></Head>
      <main className="min-h-screen text-white bg-zinc-900">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Link href="/#blog" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Blog’a dön
          </Link>
          <h1 className="mt-6 text-3xl font-semibold">Yazı: {slug}</h1>
          {/* Buraya istersen BlogPostClient'i import edip gerçek içeriği render edebilirsin */}
        </div>
      </main>
    </>
  );
}

type RunQueryRow = { document?: { fields?: { slug?: { stringValue?: string } } } };

export const getStaticPaths: GetStaticPaths = async () => {
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const apiKey = process.env.FIREBASE_API_KEY!;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: "posts" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "published" },
        },
      },
      select: { fields: [{ fieldPath: "slug" }] },
      limit: 1000,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const rows = (await res.json()) as RunQueryRow[];
  const slugs = rows?.map(r => r.document?.fields?.slug?.stringValue).filter(Boolean) ?? [];

  return {
    paths: slugs.map(slug => ({ params: { slug: slug! } })),
    fallback: false, // static export için zorunlu
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  return { props: { slug: String(params?.slug) } };
};
