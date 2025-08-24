// src/app/blog/[slug]/generateStaticParams.ts
// Server-only: Statik export sırasında Firestore REST ile slug listesi üretir.

type RunQueryRow = {
  document?: {
    fields?: { slug?: { stringValue?: string } };
  };
};

export async function generateStaticParams() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_API_KEY;

  // Env yoksa build'in patlamasını önleyelim (boş üretim)
  if (!projectId || !apiKey) return [];

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
    // Not: build-time'da Node ortamında çalışır
  });

  if (!res.ok) return [];

  const rows = (await res.json()) as RunQueryRow[];
  const slugs =
    rows?.map((r) => r.document?.fields?.slug?.stringValue).filter(Boolean) ||
    [];

  return slugs.map((slug) => ({ slug: slug! }));
}

// (opsiyonel) Bilinmeyen slug'larda 404 istiyorsan:
export const dynamicParams = false;
