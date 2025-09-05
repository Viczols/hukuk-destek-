// src/app/components/Hero.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function Hero() {
  const [index, setIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [isHover, setIsHover] = useState(false);
  const [inView, setInView] = useState(true); // slider görünürde mi?

  const slides = [
    {
      title: "Uzman Yardımıyla Dilekçe",
      desc: "Vakanı uzmanla konuş, aynı gün PDF dilekçe teslim al.",
      img: "/images/ChatGPT Image 15 Ağu 2025 16_15_57.png",
      ctaLabel: "Paketleri Gör",
      ctaAction: () => scrollToId("paketler"),
    },
    // ⬇️ 2. SLAYT GÜNCELLENDİ: Online Danışma + /danismanlik
    {
      title: "Online Danışma",
      desc: "Avukatlarımızla online görüşme — hızlı, güvenli randevu.",
      img: "/images/ChatGPT Image 15 Ağu 2025 16_18_37.png",
      ctaLabel: "Online Danışma",
      ctaAction: () => (window.location.href = "/danismanlik"),
    },
    {
      title: "AI Destekli Süreç",
      desc: "Süreç boyunca akıllı öneriler, daha hızlı ilerleme.",
      img: "/images/779d4401-61c7-4667-bfc8-7394d2c55066.png",
      ctaLabel: "SSS’yi Aç",
      ctaAction: () => (window.location.hash = "sss"),
    },
  ];

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Slider görünürlük takibi
  useEffect(() => {
    const target = sectionRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        setInView(e.isIntersecting && e.intersectionRatio >= 0.5);
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  // Autoplay
  useEffect(() => {
    const pageVisible =
      typeof document !== "undefined" ? document.visibilityState === "visible" : true;
    if (!isHover && inView && pageVisible) {
      intervalRef.current = window.setInterval(() => {
        setIndex((i) => (i + 1) % slides.length);
      }, 5000);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isHover, inView, slides.length]);

  // Aktif slayta yatay kaydır
  useEffect(() => {
    if (!inView) return;
    const el = wrapperRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement | undefined;
    if (child) {
      const left = child.offsetLeft;
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ left, behavior: "smooth" });
      } else {
        (el as any).scrollLeft = left;
      }
    }
  }, [index, inView]);

  return (
    <section
      ref={sectionRef}
      className="relative pt-0 overflow-x-clip"
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      {/* SLIDER */}
      <div
        ref={wrapperRef}
        className="flex overflow-x-auto overflow-y-hidden scroll-smooth no-scrollbar w-full touch-pan-y"
        style={{ scrollBehavior: "smooth", overscrollBehaviorX: "contain", overscrollBehaviorY: "auto" }}
        aria-roledescription="carousel"
        aria-label="Tanıtım slaytları"
      >
        {slides.map((s, i) => (
          <div
            key={i}
            className="relative min-w-full h-[70vh] flex items-center justify-center"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${slides.length}`}
          >
            <Image src={s.img} alt={s.title} fill priority={i === 0} className="object-cover" />
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10 max-w-2xl text-center text-white px-4">
              <h1 className="text-2xl md:text-4xl font-semibold tracking-tight mb-4 drop-shadow-lg">
                {s.title}
              </h1>
              <p className="text-sm md:text-base mb-6 drop-shadow-md">{s.desc}</p>
              <button
                onClick={s.ctaAction}
                className="inline-flex items-center gap-2 rounded-xl bg-white text-black px-5 py-3 hover:bg-gray-200 transition"
              >
                {s.ctaLabel}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 rounded-full border border-white/40 bg-white/70 backdrop-blur px-3 py-1.5 z-20">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Slayta git: ${i + 1}`}
            className={`h-2 w-2 rounded-full ${index === i ? "bg-black" : "bg-gray-400"}`}
          />
        ))}
      </div>

      {/* Oklar */}
      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 z-20 pointer-events-none">
        <button
          onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
          className="pointer-events-auto rounded-full bg-white/70 backdrop-blur border border-white/40 p-2 hover:bg-white"
          aria-label="Önceki slayt"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={() => setIndex((i) => (i + 1) % slides.length)}
          className="pointer-events-auto rounded-full bg-white/70 backdrop-blur border border-white/40 p-2 hover:bg-white"
          aria-label="Sonraki slayt"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
