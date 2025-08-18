"use client";

import { useState } from "react";

type QA = { question: string; answer: string };

const faqs: QA[] = [
  {
    question: "Bu platformda nasıl dilekçe satın alırım?",
    answer:
      "Ana sayfadaki Paketler bölümünden ihtiyacınıza uygun paketi seçip giriş yaptıktan sonra satın alma adımlarını izleyin. Ödeme sonrası dilekçeniz oluşturulur ve panelinizden indirilebilir.",
  },
  {
    question: "Avukatla görüşme nasıl gerçekleşiyor?",
    answer:
      "Görüşme paketini aldıktan sonra size uygun zaman ve kanal belirlenir. Görüşmeler Zoom, WhatsApp ya da telefon üzerinden yapılabilir. Randevu bilgileriniz e-posta ve panelinize iletilir.",
  },
  {
    question: "Yapay zekâ dilekçeyi nasıl hazırlar, avukat kontrolü var mı?",
    answer:
      "Ön bilgilerinizi formla alıyoruz; yapay zekâ ilk taslağı oluşturuyor. Nihai metin, kalite ve uygunluk için avukat desteğiyle elden geçirilir ve onaylandıktan sonra PDF olarak verilir.",
  },
  {
    question: "Satın aldığım dilekçeye nereden erişirim?",
    answer:
      "Giriş yaptıktan sonra ‘Satın Alma Geçmişi’ bölümünde belgenizi görebilir ve indirebilirsiniz. Dilerseniz daha sonra düzenlemek için de kopyasını saklayabilirsiniz.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  const toggle = (i: number) => setOpen((prev) => (prev === i ? null : i));

  return (
 <section id="sss" className="relative pt-16 md:pt-20 pb-12 md:pb-16 bg-gradient-to-b from-zinc-900 to-zinc-800">

      <div className="max-w-5xl mx-auto px-4">
        <header className="text-center mb-8 md:mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Sıkça Sorulan Sorular
          </h2>
          <p className="mt-2 text-zinc-300">
            En merak edilen konuları aşağıda derledik. Daha fazlası için bize ulaşın.
          </p>
        </header>

        <div className="space-y-3">
          {faqs.map((item, i) => {
            const isOpen = open === i;
            const contentId = `faq-panel-${i}`;
            const btnId = `faq-button-${i}`;
            return (
              <div
                key={i}
                className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md text-zinc-200 shadow-sm"
              >
                <button
                  id={btnId}
                  aria-controls={contentId}
                  aria-expanded={isOpen}
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/5 transition"
                >
                  <span className="text-base md:text-lg font-medium text-white">
                    {item.question}
                  </span>

                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 transition-transform ${
                      isOpen ? "rotate-45" : ""
                    }`}
                    aria-hidden="true"
                  >
                    {/* artı işareti (açılınca döndürüp eksi etkisi veriyoruz) */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="text-white"
                    >
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>

                {/* içerik */}
                <div
                  id={contentId}
                  role="region"
                  aria-labelledby={btnId}
                  className={`grid overflow-hidden transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0">
                    <div className="px-5 pb-5 pt-0 text-sm md:text-base leading-relaxed text-zinc-200/90">
                      {item.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* alt not / iletişim */}
        <div className="mt-8 md:mt-10 flex flex-col items-center gap-3 text-sm text-zinc-300">
          <div>Daha fazla sorunuz mu var?</div>
          <a
            href="/iletisim"
            className="rounded-full bg-white text-zinc-900 px-4 py-2 font-medium hover:bg-zinc-200 transition"
          >
            Bize Ulaşın
          </a>
        </div>
      </div>
    </section>
  );
}
