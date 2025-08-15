// app/panel/page.tsx
"use client";
import Link from "next/link";

export default function PanelIndex() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link href="/panel/chats" className="rounded-xl border p-4 hover:bg-gray-50">
        <h3 className="font-semibold">Sohbetler</h3>
        <p className="text-sm text-gray-600">Bekleyen ve atanmış sohbetleri yönet.</p>
      </Link>
      <Link href="/panel/blog" className="rounded-xl border p-4 hover:bg-gray-50">
        <h3 className="font-semibold">Blog</h3>
        <p className="text-sm text-gray-600">Yeni yazı ekle, düzenle.</p>
      </Link>
      <Link href="/panel/orders" className="rounded-xl border p-4 hover:bg-gray-50">
        <h3 className="font-semibold">Siparişler (PDF)</h3>
        <p className="text-sm text-gray-600">PDF yükle, teslim et.</p>
      </Link>
      <Link href="/panel/settings" className="rounded-xl border p-4 hover:bg-gray-50">
        <h3 className="font-semibold">Ayarlar</h3>
        <p className="text-sm text-gray-600">Durum ve çalışma saatleri.</p>
      </Link>
    </div>
  );
}
