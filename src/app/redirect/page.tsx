// src/app/redirect/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Statik export + App Router için güvenli client-side redirect.
// /redirect?to=/hedef  -> /hedef
export default function RedirectPage() {
  return <RedirectClient />;
}

function RedirectClient() {
  const router = useRouter();

  useEffect(() => {
    // URL parametresini doğrudan window.location’dan oku (SSR yok, client’tayız)
    const search = typeof window !== "undefined" ? window.location.search : "";
    const urlParams = new URLSearchParams(search);
    const raw = urlParams.get("to") || "/";

    // Basit güvenlik: sadece site içi path’e izin ver
    const to = raw.startsWith("/") ? raw : "/";

    router.replace(to);
  }, [router]);

  return <Fallback />;
}

function Fallback() {
  return (
    <main className="min-h-[50vh] flex items-center justify-center">
      <p className="text-sm text-zinc-600">Yönlendiriliyor…</p>
    </main>
  );
}
