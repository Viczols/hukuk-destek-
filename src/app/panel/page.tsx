"use client";
import Link from "next/link";

export default function PanelIndex() {
  const Card = ({
    href,
    title,
    desc,
    icon,
  }: {
    href: string;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }) => (
    <Link
      href={href}
      className="group h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:translate-y-[-2px] hover:shadow-md"
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200">
        {icon}
      </div>
      <h3 className="mb-1 text-base font-semibold text-zinc-900">{title}</h3>
      <p className="text-sm text-zinc-600">{desc}</p>

      <div className="mt-4 text-sm font-medium text-zinc-800 opacity-0 transition group-hover:opacity-100">
        → Aç
      </div>
    </Link>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card
        href="/panel/chats"
        title="Sohbetler"
        desc="Bekleyen ve atanmış sohbetleri yönet."
        icon={<svg width="18" height="18" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" fill="currentColor"/></svg>}
      />
      <Card
        href="/panel/blog"
        title="Blog"
        desc="Yeni yazı ekle, düzenle."
        icon={<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 19.5V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M8 7h12M8 11h12M8 15h8" stroke="currentColor" strokeWidth="2"/></svg>}
      />
      <Card
        href="/panel/orders"
        title="Siparişler (PDF)"
        desc="PDF yükle, teslim et."
        icon={<svg width="18" height="18" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h10a2 2 0 0 0 2-2V8l-6-6Z" fill="currentColor"/></svg>}
      />
    </div>
  );
}
