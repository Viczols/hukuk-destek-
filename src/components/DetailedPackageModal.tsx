import { useState } from "react";

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

  const REQUIRED_TEXT = "Okudum, anladım ve kabul ediyorum";
  const isFormValid = accepted && confirmationText.trim() === REQUIRED_TEXT;

  if (!isOpen) return null;

  const isAI = type === "dilekce";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div
        className="bg-white text-black rounded-xl shadow-2xl w-full max-w-lg p-8 relative"
      >
        {/* Kapat Butonu */}
        <button
          onClick={onClose}
          className="absolute top-2 right-3 text-gray-500 hover:text-red-600 text-xl font-bold"
        >
          ×
        </button>

        {/* Başlık */}
        <h2 className="text-2xl font-bold text-blue-800 mb-4">
          {isAI
            ? "🤖 Yapay Zeka ile Dilekçe Yazımı"
            : "📄 Uzman Destekli Dilekçe"}
        </h2>

        {/* Açıklamalar */}
        <ul className="list-disc list-inside text-gray-800 mb-4 space-y-2 text-sm">
          {isAI ? (
            <>
              <li>Bu hizmet, yapay zeka tarafından otomatik dilekçe üretimi sunar.</li>
              <li>Tarafınıza ilettiğiniz bilgiler doğrultusunda otomatik olarak oluşturulur.</li>
              <li><strong>Yasal sorumluluk kabul edilmez.</strong> Dilekçeler bilgilendirme amaçlıdır.</li>
            </>
          ) : (
            <>
              <li>Bu hizmette, uzman desteğiyle dilekçeniz hazırlanır.</li>
              <li>Durumunuz değerlendirildikten sonra size özel PDF olarak teslim edilir.</li>
              <li>Dilekçe en geç <strong>1-3 iş günü</strong> içerisinde hazırlanır.</li>
              <li><strong>Yasal sorumluluk tarafınıza aittir.</strong> Bilgilerin doğruluğu önemlidir.</li>
            </>
          )}
        </ul>

        {/* Onay Checkbox */}
        <div className="flex items-start mb-4">
          <input
            id="accept"
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1"
          />
          <label htmlFor="accept" className="ml-2 text-sm text-gray-700">
            Yukarıdaki şartları <strong>kabul ediyorum</strong>.
          </label>
        </div>

        {/* Onay Metni Girişi */}
        <div className="mb-4">
          <label htmlFor="confirmation" className="block text-sm font-medium text-gray-700 mb-1">
            Lütfen aşağıdaki metni eksiksiz yazınız:
          </label>
          <p className="text-sm text-gray-600 italic mb-1">{`"${REQUIRED_TEXT}"`}</p>
          <input
            type="text"
            id="confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring focus:border-blue-500"
            placeholder="Metni buraya yazınız"
          />
        </div>

        {/* Butonlar */}
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition"
          >
            Vazgeç
          </button>
          <button
            onClick={() => {
              if (isFormValid) {
                onBuyClick();
              }
            }}
            disabled={!isFormValid}
            className={`px-4 py-2 text-white rounded transition ${
              isFormValid
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-300 cursor-not-allowed"
            }`}
          >
            Satın Al ve Devam Et
          </button>
        </div>
      </div>
    </div>
  );
}
