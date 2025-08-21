// app/danismanlik/page.tsx
import Navbar from "../../components/Navbar";

export default function DanismanlikPage() {
  return (
    
    <>
            <Navbar
        variant="consulting"
        hideLinks={["paketler","blog","danismanlik"]} // istersen ["blog","sss","panel"] vs. ekleyebilirsin
        extraRight={
          <a
            href="#avukatlar"
            className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
          >
            Avukatlar
          </a>
        }
      />
      <main className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black text-white">
        {/* HERO */}
        <section className="relative overflow-hidden">
          {/* arkaplan süsleri */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[1100px] h-[1100px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-40 right-0 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_60%)] blur-2xl" />
          
          <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 relative">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                <span className="size-2 rounded-full bg-emerald-400" /> Yeni: Online Danışmanlık
              </span>

              <h1 className="mt-4 text-4xl md:text-5xl font-semibold leading-tight text-white">
                Avukatlarımızla <span className="text-zinc-200">online</span> görüşün,<br />
                <span className="text-zinc-300">hızlı ve güvenli</span> randevu alın.
              </h1>

              <p className="mt-4 text-zinc-300 max-w-2xl">
                Size uygun uzmanı seçin, takvimden uygun bir saat belirleyin ve
                dakikalar içinde görüşmenizi başlatın. Tümü tek panelden, güvenle.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#avukatlar"
                  className="inline-flex items-center gap-2 rounded-full bg-white text-black px-5 py-2.5 font-semibold hover:bg-zinc-100 transition"
                >
                  Avukatları Gör
                  <svg width="16" height="16" viewBox="0 0 24 24" className="-mr-1"><path fill="currentColor" d="M13 5l7 7-7 7v-4H4v-6h9V5z"/></svg>
                </a>
                <a
                  href="#nasil-calisir"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-zinc-200 hover:bg-white/10 transition"
                >
                  Nasıl çalışır?
                </a>
              </div>
            </div>
          </div>
        </section>
      {/* NASIL ÇALIŞIR */}
      <section id="nasil-calisir" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-semibold">3 adımda randevu</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-6">
          {[
            { title: "Avukat seç", desc: "Uzmanlık alanına göre filtrele, profilleri incele." },
            { title: "Saat belirle", desc: "Uygun slotlardan birini tek tıkla rezerve et." },
            { title: "Görüşmeyi başlat", desc: "Onayla ve belirlenen saatte online görüş." },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="size-10 grid place-items-center rounded-full bg-white text-black font-bold">
                {i + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-1.5 text-zinc-300">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ÖNE ÇIKAN AVUKATLAR (placeholder görsel) */}
      <section id="avukatlar" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl md:text-3xl font-semibold">Öne çıkan avukatlar</h2>
          <a href="/avukatlar" className="text-sm text-zinc-300 hover:text-white transition">Tümünü gör →</a>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="group rounded-2xl border border-white/10 bg-white/5 overflow-hidden hover:bg-white/10 transition">
              <div className="h-40 bg-[linear-gradient(120deg,rgba(255,255,255,0.12),transparent)] relative">
                <div className="absolute inset-0 grid place-items-center">
                  <div className="size-16 rounded-full bg-white/80" />
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Av. Ad Soyad</h3>
                  <span className="text-xs rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-zinc-200">5.0 ★</span>
                </div>
                <p className="mt-1 text-sm text-zinc-300">Aile Hukuku, İş Hukuku</p>
                <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                  10+ yıllık tecrübe. Online danışmanlık ve dava süreçlerinde destek.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <a
                    href={`/randevu/${i}`}
                    className="rounded-full bg-white text-black px-4 py-2 text-sm font-semibold hover:bg-zinc-100 transition"
                  >
                    Randevu Al
                  </a>
                  <a
                    href={`/avukat/${i}`}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition"
                  >
                    Profili Gör
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AVANTAJLAR */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { h: "Hızlı başvuru", p: "Dakikalar içinde randevu, bekleme yok." },
            { h: "Güvenli süreç", p: "Verileriniz korumalı, görüşmeler gizli." },
            { h: "Uygun zaman", p: "Size uyan saatleri anında seçin." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold text-white">{f.h}</h3>
              <p className="mt-1.5 text-zinc-300">{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 md:p-10 text-center">
          <h3 className="text-2xl md:text-3xl font-semibold text-white">
            İlk danışmanlığınızı şimdi planlayın
          </h3>
          <p className="mt-2 text-zinc-300">
            Uygun bir saat seçin, uzmanla online görüşmeye başlayın.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <a
              href="#avukatlar"
              className="rounded-full bg-white text-black px-5 py-2.5 font-semibold hover:bg-zinc-100 transition"
            >
              Avukatları Gör
            </a>
            <a
              href="/avukatlar"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-zinc-200 hover:bg-white/10 transition"
            >
              Tüm Uzmanlar
            </a>
          </div>
        </div>
      </section>

      {/* SSS (placeholder) */}
      <section id="sss" className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-2xl md:text-3xl font-semibold">Sık Sorulan Sorular</h2>
        <div className="mt-6 space-y-3">
          {[
            { q: "Randevu nasıl oluşturulur?", a: "Avukat seçip uygun saat slotunu tıklayın ve onaylayın." },
            { q: "Görüşme nereden yapılır?", a: "Panel üzerinden online görüşmeyi başlatabilirsiniz." },
            { q: "İptal/erteleme mümkün mü?", a: "Belirli süreler içinde panelden talepte bulunabilirsiniz." },
          ].map((qa, i) => (
            <details key={i} className="group rounded-xl border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer list-none text-white font-medium flex items-center justify-between">
                {qa.q}
                <span className="text-zinc-300 group-open:rotate-180 transition">
                  ▼
                </span>
              </summary>
              <p className="mt-2 text-zinc-300">{qa.a}</p>
            </details>
          ))}
        </div>
      </section>
      </main>
    </>
  );
}