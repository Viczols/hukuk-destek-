// src/components/DetailedPackageModal.tsx
"use client";
import { useEffect, useRef, useState } from "react";

interface DetailedPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBuyClick: () => void;
  type: "dilekce" | "uzman";
}

export default function DetailedPackageModal({
  isOpen,
  onClose,
  onBuyClick,
  type,
}: DetailedPackageModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const REQUIRED_TEXT = "Okudum, anladım ve kabul ediyorum";
  const isFormValid = accepted && confirmationText.trim() === REQUIRED_TEXT;
  const isAI = type === "dilekce";

  useEffect(() => {
    if (!isOpen) return;
    setAccepted(false);
    setConfirmationText("");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (accepted) inputRef.current?.focus();
  }, [accepted]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl border border-zinc-800"
      >
        {/* Kapat */}
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full bg-zinc-800/90 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="p-6 md:p-7">
          {/* Başlık */}
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-xl bg-zinc-800 border border-zinc-700">
              {isAI ? "🤖" : "📄"}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-white">
                {isAI ? "Yapay Zekâ ile Dilekçe" : "Uzman Destekli Dilekçe"}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {isAI
                  ? "Hızlı taslak + uzman son okuma ile PDF teslim."
                  : "Bire bir uzman desteği, vaka değerlendirme ve PDF teslim."}
              </p>
            </div>
          </div>

          {/* Ayırıcı */}
          <div className="mt-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Açıklamalar — ilk halindeki gibi net ve yeterli */}
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            {isAI ? (
              <>
                <li>• Sağladığınız bilgilere göre yapay zekâ ilk taslağı hazırlar.</li>
                <li>• Nihai metin uzman tarafından kontrol edildikten sonra teslim edilir.</li>
                <li>• Paylaştığınız bilgilerin doğruluğundan tarafınız sorumludur.</li>
              </>
            ) : (
              <>
                <li>• Uzman, dosyanızı değerlendirir ve yol haritası oluşturur.</li>
                <li>• Durumunuza özel metin hazırlanır ve PDF olarak teslim edilir.</li>
                <li>• Teslim süresi iş yoğunluğuna göre değişebilir (genellikle 1–3 iş günü).</li>
              </>
            )}
          </ul>

          {/* Güven satırı */}
          <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-zinc-800 border border-zinc-700">🔒</span>
            <span>Güvenli ödeme — iyzico altyapısı</span>
          </div>

          {/* Onay Bloğu — soft, tek yerde referans metni */}
          <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
            <label htmlFor="accept" className="flex items-center gap-3 cursor-pointer">
              <input
                id="accept"
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 focus:ring-2 focus:ring-indigo-400/40"
              />
              <span className="text-sm font-medium text-zinc-100">Koşulları kabul ediyorum</span>
            </label>

            <div className="mt-3 grid gap-2">
              <div className="text-xs text-zinc-400">
                Devam etmek için aşağıdaki metni <span className="text-zinc-200">aynen</span> yazınız:
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
                <div className="text-[11px] text-zinc-500">Gerekli metin</div>
                <div className="text-sm font-medium text-zinc-200 select-all">{REQUIRED_TEXT}</div>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Metni buraya yazınız"
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-indigo-400/40"
              />
            </div>
          </div>

          {/* Butonlar */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 transition"
            >
              Vazgeç
            </button>
            <button
              onClick={() => isFormValid && onBuyClick()}
              disabled={!isFormValid}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isFormValid
                  ? "bg-white text-zinc-900 hover:bg-zinc-200"
                  : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              }`}
            >
              Satın Al ve Devam Et
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
