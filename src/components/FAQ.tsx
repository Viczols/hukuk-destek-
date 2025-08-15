"use client";

import { useState } from "react";

const faqs = [
  {
    question: "Bu site üzerinden nasıl dilekçe satın alabilirim?",
    answer:
      "Ana sayfadaki 'Paketler' bölümünden dilekçe paketi seçerek satın alma işlemini başlatabilirsiniz. Giriş yapmanız gerekmektedir.",
  },
  {
    question: "Avukatla görüşme nasıl gerçekleşiyor?",
    answer:
      "Görüşme paketlerinden birini satın aldıktan sonra, size uygun zaman ve yöntem belirlenir. Görüşmeler Zoom, WhatsApp veya telefon üzerinden yapılabilir.",
  },
  {
    question: "Yapay zekâ dilekçeyi nasıl oluşturuyor?",
    answer:
      "Kullanıcının doldurduğu bilgiler doğrultusunda yapay zekâ sistemimiz kişiselleştirilmiş dilekçe üretir. Bu dilekçeler son kontrol için avukat desteğiyle sunulur.",
  },
  {
    question: "Satın aldığım dilekçeye nasıl ulaşırım?",
    answer:
      "Satın alma geçmişi bölümünden giriş yaparak geçmiş dilekçelerinizi görebilir ve indirebilirsiniz.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="sss" className="max-w-4xl mx-auto py-16 px-4">
      <h2 className="text-3xl font-bold text-center text-blue-800 mb-10">
        Sıkça Sorulan Sorular
      </h2>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg shadow-sm transition-all duration-200">
            <button
              className="w-full flex justify-between items-center p-4 text-left text-gray-800 hover:bg-blue-50 font-medium"
              onClick={() => toggle(index)}
            >
              <span>{faq.question}</span>
              <span>{openIndex === index ? "−" : "+"}</span>
            </button>

            {openIndex === index && (
              <div className="px-4 pb-4 text-gray-700 leading-relaxed">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
