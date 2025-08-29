"use client";

import { useState, useEffect } from "react";
import { auth, dbRealtime } from "../firebase/config";
import { ref, onValue } from "firebase/database";
import DetailedPackageModal from "./DetailedPackageModal";
import Modal from "./Modal";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";

const BASE = process.env.NEXT_PUBLIC_FUNCTIONS_BASE!; // <-- Cloud Functions URL'i

export default function Packages() {
  const [selectedType, setSelectedType] = useState<null | "dilekce" | "uzman">(
    null
  );
  const [modalType, setModalType] = useState<null | "login" | "register">(null);
  const [noLawyerModal, setNoLawyerModal] = useState(false);
  const [onlineLawyerCount, setOnlineLawyerCount] = useState(0);

  const dilekcePrice = 152;
  const uzmanPrice = 2001;

  const toMillis = (v: any): number => {
    if (typeof v === "number") return v;
    if (v && typeof v.toMillis === "function") return v.toMillis();
    if (v && typeof v.seconds === "number") return v.seconds * 1000;
    return 0;
  };

  useEffect(() => {
    const lawyersRef = ref(dbRealtime, "lawyers");
    const unsubscribe = onValue(lawyersRef, (snapshot) => {
      if (!snapshot.exists()) {
        setOnlineLawyerCount(0);
        return;
      }
      const data = snapshot.val() || {};
      const now = Date.now();
      const count = Object.values<any>(data).filter((lawyer: any) => {
        const isOnline = lawyer?.isOnline === true;
        const hb = toMillis(lawyer?.heartbeatAt);
        const ls = toMillis(lawyer?.lastSeen);
        const fresh = now - hb < 120_000 || now - ls < 120_000;
        return isOnline && fresh;
      }).length;
      setOnlineLawyerCount(count);
    });
    return () => unsubscribe();
  }, []);

  const closeAllModals = () => {
    setSelectedType(null);
    setModalType(null);
    setNoLawyerModal(false);
  };

  const startPayment = async (
    type: "gorusme" | "dilekce" | "uzman",
    price: number
  ) => {
    const user = auth.currentUser;

    if (!user) {
      localStorage.setItem("pendingPackage", JSON.stringify({ type, price }));
      setModalType("login");
      return;
    }

    if (type === "gorusme" && onlineLawyerCount === 0) {
      setNoLawyerModal(true);
      return;
    }

    // success ekranında hangi modalı göstereceğini bilsin
    localStorage.setItem(
      "pendingPurchaseType",
      type === "dilekce" ? "dilekce" : "uzman"
    );

    try {
      const productName =
        type === "gorusme"
          ? "Görüşme Paketi"
          : type === "uzman"
          ? "Uzman Yardımıyla Dilekçe Yazımı"
          : "Dilekçe Paketi";

      const res = await fetch(`${BASE}/createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.email?.split("@")[0],
          userId: user.uid,
          productType: productName,
          productKey: type, // "gorusme" | "dilekce" | "uzman"
          price,
          returnBase: window.location.origin,
        }),
      });

      // Ağ hatası
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Ödeme başlatılamadı: ${txt || res.status}`);
      }

      const data = await res.json();
      // Beklenen yeni alanlar:
      // - data.ok: boolean
      // - data.mode: "redirect" | "embedded"
      // - redirect ise: data.paymentPageUrl
      // - embedded ise: data.checkoutFormContent
      // Geriye dönük uyum:
      // - eski akışta data.html dönebiliyordu (sarmallanmış)

      if (!data?.ok) {
        throw new Error(`Ödeme başlatılamadı: ${data?.error || "Bilinmeyen hata"}`);
      }

      // 1) YENİ: redirect modu
      if (data.mode === "redirect" && data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
        return;
      }

      // 2) YENİ: embedded modu (checkoutFormContent)
      if (data.mode === "embedded" && data.checkoutFormContent) {
        // İyziCo içeriğini basmak için basit bir HTML kabuğu
        const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Ödeme</title>
</head>
<body>
${data.checkoutFormContent}
</body>
</html>`;
        const w = window.open("", "_self");
        if (w && w.document) {
          w.document.open();
          w.document.write(html);
          w.document.close();
        } else {
          // çok nadir self kapalıysa fallback
          window.location.href = `/redirect?html=${encodeURIComponent(btoa(html))}`;
        }
        return;
      }

      // 3) ESKİ: html alanı dönerse (geriye dönük destek)
      if (data?.ok && data?.html) {
        const w = window.open("", "_self");
        if (w && w.document) {
          w.document.open();
          w.document.write(data.html);
          w.document.close();
        } else {
          window.location.href = `/redirect?html=${encodeURIComponent(
            btoa(data.html)
          )}`;
        }
        return;
      }

      // Hiçbiri yoksa:
      console.error("createSession response:", data);
      throw new Error("Ödeme başlatılamadı: Bilinmeyen hata");
    } catch (err: any) {
      console.error("Ödeme başlatılırken hata:", err);
      alert(err?.message || "Ödeme sırasında bir hata oluştu.");
    }
  };

  const formatTRY = (n: number) =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <section
      id="paketler"
      className="relative py-16 md:py-20 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-900 text-zinc-100"
    >
      {/* Üst/alt yumuşak geçişler (fade) + ince çizgiler */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-4">
        {/* Üst başlık */}
        <header className="text-center mb-10 md:mb-14">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Uzman Ekip — Net Süreç — Güvenli Ödeme
          </h2>
        <p className="mt-2 text-zinc-300">
            Baroya kayıtlı uzmanlarla, şeffaf fiyat ve iyzico güvencesi.
          </p>
        </header>

        {/* Kartlar */}
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Dilekçe Kartı */}
          <article className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 hover:bg-white/10 transition shadow-sm h-full flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  🤖 Yapay Zeka ile Dilekçe
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Hızlı taslak + uzman bakışı
                </p>
              </div>
              {/* Fiyat rozeti */}
              <span className="rounded-full px-3 py-1 bg-white text-zinc-900 text-sm font-medium shadow">
                {formatTRY(dilekcePrice)}
              </span>
            </div>

            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>• AI destekli ilk taslak</li>
              <li>• Uzman tarafından son okuma</li>
              <li>• Aynı gün PDF teslim (standart iş yükünde)</li>
            </ul>

            {/* iyzico güven satırı */}
            <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/10 border border-white/15">
                🔒
              </span>
              <span>Güvenli ödeme — iyzico altyapısı</span>
            </div>

            {/* CTA */}
            <div className="mt-auto pt-5">
              <button
                onClick={() => setSelectedType("dilekce")}
                className="w-full rounded-xl bg-white text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition"
              >
                Satın Al
              </button>
            </div>
          </article>

          {/* Uzman Destek Kartı */}
          <article className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 hover:bg-white/10 transition shadow-sm h-full flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-white">
                    📄 Uzman Destekli Dilekçe
                  </h3>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15 text-zinc-300">
                    En çok tercih edilen
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mt-1">
                  Bire bir uzman desteği + yol haritası
                </p>
              </div>
              {/* Fiyat rozeti */}
              <span className="rounded-full px-3 py-1 bg-white text-zinc-900 text-sm font-medium shadow">
                {formatTRY(uzmanPrice)}
              </span>
            </div>

            {/* Özellikler */}
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>• Vakaya özel değerlendirme</li>
              <li>• Görüşme ile net yönlendirme</li>
              <li>• Uzman desteğiyle PDF teslim</li>
            </ul>

            {/* iyzico güven satırı */}
            <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/10 border border-white/15">
                🔒
              </span>
              <span>Güvenli ödeme — iyzico altyapısı</span>
            </div>

            {/* CTA + Soft uyarı (uzman yokken) */}
            <div className="mt-auto pt-5">
              <button
                onClick={() => {
                  if (onlineLawyerCount > 0) setSelectedType("uzman");
                }}
                disabled={onlineLawyerCount === 0}
                className={`w-full rounded-xl px-4 py-2 text-sm font-medium transition ${
                  onlineLawyerCount > 0
                    ? "bg-white text-zinc-900 hover:bg-zinc-200"
                    : "bg-white/10 text-zinc-400 cursor-not-allowed border border-white/15"
                }`}
              >
                Satın Al
              </button>

              {onlineLawyerCount === 0 && (
                <p className="mt-2 text-xs text-center rounded-lg bg-red-500/10 border border-red-400/20 text-red-300 px-3 py-2">
                  Şu anda çevrim içi uzman bulunmuyor. Uzmanlarımız çoğunlukla{" "}
                  <strong>hafta içi 09:00–18:00</strong> arası çevrim içi olur.
                </p>
              )}
            </div>
          </article>
        </div>
      </div>

      {/* Satın Al onay modalı */}
      {selectedType && (
        <DetailedPackageModal
          isOpen={true}
          onClose={() => setSelectedType(null)}
          onBuyClick={() =>
            startPayment(
              selectedType,
              selectedType === "dilekce" ? dilekcePrice : uzmanPrice
            )
          }
          type={selectedType}
        />
      )}

      {/* Login/Register Modal */}
      <Modal isOpen={modalType !== null} onClose={closeAllModals}>
        {modalType === "login" && (
          <LoginForm
            switchToRegister={() => setModalType("register")}
            onSuccess={closeAllModals}
          />
        )}
        {modalType === "register" && (
          <RegisterForm
            switchToLogin={() => setModalType("login")}
            onSuccess={closeAllModals}
          />
        )}
      </Modal>

      {/* Uzman Yok Modal (korundu) */}
      <Modal isOpen={noLawyerModal} onClose={() => setNoLawyerModal(false)}>
        <div className="text-center p-4">
          <h2 className="text-xl font-bold text-white mb-1">
            Şu an çevrim içi uzman bulunmuyor
          </h2>
          <p className="text-zinc-300 text-sm">
            Uygun olduğunda tekrar deneyebilirsiniz.
          </p>
        </div>
      </Modal>
    </section>
  );
}
