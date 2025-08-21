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

  const Tab = ({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) => {
    const active = pathname === href || pathname?.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={[
          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
          active
            ? "bg-zinc-700 text-white shadow"
            : "bg-zinc-600/40 text-zinc-200 hover:bg-zinc-600/60"
        ].join(" ")}
      >
        {icon}
        <span className="font-medium">{label}</span>
      </Link>
    );
  };

  return (
    <PanelGuard>
      {/* Üst bar - gri ton */}
      <div className="sticky top-0 z-40 border-b border-zinc-700 bg-zinc-800/95 backdrop-blur text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
              aria-label="Ana sayfaya dön"
            >
              <span aria-hidden>←</span>
              <span>Ana Sayfa</span>
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Uzman Paneli</h1>
          </div>
        </div>

        {/* Sekmeler */}
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <nav className="flex flex-wrap gap-2">
            <Tab
              href="/panel/chats"
              label="Sohbetler"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" fill="currentColor" />
                </svg>
              }
            />
            <Tab
              href="/panel/blog"
              label="Blog"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90">
                  <path d="M4 19.5V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M8 7h12M8 11h12M8 15h8" stroke="currentColor" strokeWidth="2" />
                </svg>
              }
            />
            <Tab
              href="/panel/orders"
              label="Siparişler (PDF)"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h10a2 2 0 0 0 2-2V8l-6-6Z" fill="currentColor" />
                </svg>
              }
            />
            {/* Ayarlar kaldırıldı */}
          </nav>
        </div>
      </div>

      {/* İçerik alanı */}
      <main className="mx-auto max-w-6xl px-4 py-6 bg-white text-zinc-900">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          {children}
        </div>
      </main>
    </PanelGuard>
  );
}
