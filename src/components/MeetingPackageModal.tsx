"use client";

import { useState } from "react";

interface MeetingPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBuyClick: (duration: number) => void;
}

export default function MeetingPackageModal({
  isOpen,
  onClose,
  onBuyClick,
}: MeetingPackageModalProps) {
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-xl shadow-2xl w-full max-w-lg p-8 relative"
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-3 text-gray-500 hover:text-red-600 text-xl font-bold"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold text-blue-800 mb-4">🗣️ Görüşme Paketi</h2>

        <p className="mb-4 text-gray-700">Lütfen görüşme süresini seçin:</p>

        <div className="flex gap-4 mb-6">
          {[5, 10, 15].map((min) => (
            <button
              key={min}
              onClick={() => setSelectedDuration(min)}
              className={`px-4 py-2 border rounded ${
                selectedDuration === min
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-800"
              }`}
            >
              {min} dk
            </button>
          ))}
        </div>

        <button
          disabled={!selectedDuration}
          onClick={() => selectedDuration && onBuyClick(selectedDuration)}
          className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 transition disabled:opacity-50"
        >
          Satın Al ve Devam Et
        </button>
      </div>
    </div>
  );
}
