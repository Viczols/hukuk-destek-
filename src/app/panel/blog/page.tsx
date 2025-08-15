// app/panel/blog/page.tsx
"use client";
export default function BlogPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Yeni Yazı</h2>
        {/* başlık, içerik, kaydet → Firestore "posts" */}
        <div className="mt-3 text-sm text-gray-600">Buraya form gelecek.</div>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Yazılarım</h2>
        <div className="mt-3 text-sm text-gray-600">Liste burada.</div>
      </div>
    </div>
  );
}
