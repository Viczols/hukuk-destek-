// src/app/panel/layout.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import PanelGuard from "./_clientGuard";
import { auth } from "../../firebase/config";
import { initLawyerPresence } from "../../firebase/presenceService";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) initLawyerPresence(u.uid, u.email || "");
    });
    return () => unsub();
  }, []);

  const Tab = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={[
          "rounded-xl px-3 py-2 text-sm transition",
          active
            ? "bg-black text-white shadow"
            : "bg-gray-100 text-gray-800 hover:bg-gray-200",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <PanelGuard>
      {/* Sticky üst bar */}
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Ana sayfa butonu */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              aria-label="Ana sayfaya dön"
            >
              <span aria-hidden>←</span>
              <span>Ana Sayfa</span>
            </Link>

            <h1 className="text-lg font-semibold tracking-tight">Uzman Paneli</h1>
          </div>

          {/* (Opsiyonel) kullanıcı göstergesi */}
          {/* <div className="text-sm text-gray-500">👤 {auth.currentUser?.email}</div> */}
        </div>

        {/* Sekmeler */}
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <nav className="flex flex-wrap gap-2">
            <Tab href="/panel/chats" label="Sohbetler" />
            <Tab href="/panel/blog" label="Blog" />
            <Tab href="/panel/orders" label="Siparişler (PDF)" />
            <Tab href="/panel/settings" label="Ayarlar" />
          </nav>
        </div>
      </div>

      {/* İçerik alanı */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          {children}
        </div>
      </main>
    </PanelGuard>
  );
}
