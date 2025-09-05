"use client";

import { useEffect, useRef, useState } from "react";

type BlogPost = { title: string; slug: string; coverUrl?: string; date?: string };

type LawyerProfile = {
  displayName: string; // Örn: "Av. Zeynep"
  avatarUrl?: string;
  city?: string;
  bar?: string;
  yearsOfExperience?: number;
  expertise: string[];
  bio?: string;
  blogPosts?: BlogPost[];
};

const SAMPLE: LawyerProfile = {
  displayName: "Av. Zeynep",
  city: "İstanbul",
  bar: "İstanbul Barosu",
  yearsOfExperience: 8,
  expertise: ["Kira Hukuku", "Tüketici Hukuku", "İş Hukuku", "İcra & İflas Hukuku", "Aile Hukuku"],
  bio:
    "Kira tespit davaları, tahliye süreçleri ve tüketici uyuşmazlıklarında pratik, hızlı ve anlaşılır çözümler sunar.",
  blogPosts: [
    { title: "Kira Artış Oranı ve Kira Tespit Davası Nasıl Açılır?", slug: "kira-artis-orani-ve-kira-tespit-davasi-nasil-acilir" },
    { title: "İşten Haksız Fesihte Tazminat Hakları", slug: "is-haksiz-fesih-tazminat-haklari" },
  ],
};

export default function LawyerProfileModal() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const L = SAMPLE;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLButtonElement>("[data-close='1']")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition"
      >
        Profili Gör
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
          <button aria-label="Kapat" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative z-[101] mx-4 w-full max-w-2xl">
            <div className="rounded-[22px] p-[1.2px] bg-[conic-gradient(from_210deg,rgba(0,0,0,0.6),rgba(37,99,235,0.55)_28%,rgba(0,0,0,0.58)_56%,rgba(37,99,235,0.2)_82%,rgba(0,0,0,0.6))] shadow-[0_12px_48px_rgba(0,0,0,0.55)]">
              <div
                ref={dialogRef}
                className="overflow-hidden rounded-[21px] bg-[#070C17]/92 backdrop-blur-xl supports-[backdrop-filter]:bg-[#070C17]/86 border border-white/10"
              >
                {/* Kapak */}
                <div className="relative h-20 sm:h-24 md:h-28">
                  <div className="absolute inset-0 bg-[radial-gradient(900px_240px_at_50%_-40%,rgba(37,99,235,0.40),transparent_60%),radial-gradient(420px_220px_at_12%_22%,rgba(37,99,235,0.16),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
                </div>

                {/* İçerik */}
                <div className="p-6 max-h-[85vh] overflow-y-auto">
                  {/* Başlık & kapat */}
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold text-white truncate">{L.displayName}</h3>
                    <button
                      data-close="1"
                      onClick={() => setOpen(false)}
                      aria-label="Kapat"
                      className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path
                          fillRule="evenodd"
                          d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* GRID */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-[180px,1fr]">
                    {/* Sol */}
                    <div className="mx-auto md:mx-0">
                      <div className="mx-auto h-28 w-28 md:h-36 md:w-36 overflow-hidden rounded-2xl ring-1 ring-white/15 bg-white text-black grid place-items-center text-3xl font-semibold shadow-xl">
                        {L.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={L.avatarUrl} alt={L.displayName} className="h-full w-full object-cover" />
                        ) : (
                          (L.displayName.replace("Av. ", "").charAt(0) || "A")
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-[13px] text-zinc-200">
                        {L.yearsOfExperience ? (
                          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2 py-1">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2a7 7 0 0 1 7 7v2h1a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1h1V9a7 7 0 0 1 7-7zm5 9V9a5 5 0 0 0-10 0v2h10z" />
                            </svg>
                            <span>{L.yearsOfExperience}+ yıl</span>
                          </div>
                        ) : null}
                        {L.city ? (
                          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2 py-1">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
                            </svg>
                            <span>{L.city}</span>
                          </div>
                        ) : null}
                        {L.bar ? (
                          <div className="col-span-2 flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2 py-1">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M5 4h14a1 1 0 0 1 1 1v3H4V5a1 1 0 0 1 1-1zm-1 6h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z" />
                            </svg>
                            <span>{L.bar}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Sağ */}
                    <div className="space-y-6">
                      {L.bio && <p className="text-sm leading-relaxed text-zinc-100">{L.bio}</p>}

                      <section>
                        <h4 className="mb-2 text-sm font-semibold text-white">Uzmanlık Alanları</h4>
                        <div className="flex flex-wrap gap-2">
                          {L.expertise.map((e) => (
                            <span
                              key={e}
                              className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      </section>

                      {L.blogPosts && L.blogPosts.length > 0 && (
                        <section>
                          <h4 className="mb-2 text-sm font-semibold text-white">Yazdığı Bloglar</h4>
                          <ul className="overflow-hidden rounded-xl border border-white/10 divide-y divide-white/5">
                            {L.blogPosts.map((p) => (
                              <li
                                key={p.slug}
                                className="group flex items-center gap-3 bg-white/[0.06] p-3 transition hover:bg-white/[0.1]"
                              >
                                <div className="h-10 w-16 flex-shrink-0 rounded bg-white/10" />
                                <a
                                  href={`/blog/${p.slug}`}
                                  className="min-w-0 flex-1 truncate text-sm font-medium text-white underline-offset-2 group-hover:underline"
                                >
                                  {p.title}
                                </a>
                                <svg className="h-4 w-4 text-zinc-400 transition group-hover:text-white" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M13 5l7 7-7 7v-4H4v-6h9V5z" />
                                </svg>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setOpen(false)}
                          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-zinc-100 hover:bg-white/15 transition"
                        >
                          Kapat
                        </button>
                        <a
                          href="/randevu/avukat-zeynep"
                          data-lawyer="Av. Zeynep"
                          data-price="3500"
                          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 transition"
                        >
                          Randevu Al
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
                {/* /İçerik */}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
