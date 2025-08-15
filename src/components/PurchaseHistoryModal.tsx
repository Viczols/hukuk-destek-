"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { auth } from "../firebase/config";
import { getFirestore, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { dbRealtime } from "../firebase/config";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // ✅ geçmişten “Sohbeti Başlat” tıklanınca parent’a bildirmek için
  onStartChat?: (purchaseId: string) => void;
}

interface Purchase {
  id: string;
  type: string;
  status: string;
  createdAt: number;
  productType?: string;
  // 👇 opsiyonel alanlar (eğer Firestore'a yazıyorsak)
  storagePath?: string;
  downloadUrl?: string;
}

export default function PurchaseHistoryModal({ isOpen, onClose, onStartChat }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [formattedDates, setFormattedDates] = useState<Record<string, string>>({});
  const [onlineLawyerCount, setOnlineLawyerCount] = useState(0);

  // 🔽 PDF Yükleme için
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    const lawyersRef = ref(dbRealtime, "lawyers");
    const unsubscribe = onValue(lawyersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const count = Object.values(data).filter(
          (lawyer: any) => lawyer.isOnline
        ).length;
        setOnlineLawyerCount(count);
      } else {
        setOnlineLawyerCount(0);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchPurchases = async () => {
      if (!auth.currentUser) return;

      const db = getFirestore();
      const q = query(
        collection(db, "purchases"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("date", "desc")
      );
      const snapshot = await getDocs(q);

      const list: Purchase[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        type: doc.data().productKey || doc.data().type || "dilekce",
        status: doc.data().status || "completed",
        createdAt: doc.data().date?.toDate().getTime() || 0,
        productType: doc.data().productType || "",
        storagePath: doc.data().storagePath || "",
        downloadUrl: doc.data().downloadUrl || "",
      }));

      setPurchases(list);
    };

    if (isOpen) fetchPurchases();
  }, [isOpen]);

  useEffect(() => {
    const newDates: Record<string, string> = {};
    purchases.forEach((p) => {
      if (p.createdAt) {
        newDates[p.id] = new Date(p.createdAt).toLocaleString();
      }
    });
    setFormattedDates(newDates);
  }, [purchases]);

  const handleStartChat = (purchaseId: string) => {
    if (onlineLawyerCount === 0) {
      alert("Şu anda çevrim içi uzman bulunmamaktadır. Hafta içi 09:00 - 18:00 arasında tekrar deneyin.");
      return;
    }
    onStartChat?.(purchaseId);
    onClose();
  };

  // ====== PDF YÜKLEME ======
  function openFileDialog(purchaseId: string) {
    setPendingUploadId(purchaseId);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Sadece PDF kabul et
    if (file.type !== "application/pdf") {
      alert("Lütfen PDF dosyası seçin.");
      e.target.value = "";
      return;
    }

    const purchaseId = pendingUploadId;
    if (!purchaseId) {
      alert("Sipariş numarası bulunamadı.");
      e.target.value = "";
      return;
    }

    try {
      setUploadingId(purchaseId);

      // FormData → API'ye gönder
      const fd = new FormData();
      fd.append("purchaseId", purchaseId);
      fd.append("file", file); // Sunucu dosyayı `petitions/<purchaseId>.pdf` olarak kaydedecek

      const res = await fetch("/api/upload-petition", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Yükleme başarısız");

      // Yerel state’i güncelle (durumu completed yap + varsa linki ekle)
      setPurchases((prev) =>
        prev.map((p) =>
          p.id === purchaseId
            ? {
                ...p,
                status: "completed",
                storagePath: data.storagePath || p.storagePath,
                downloadUrl: data.downloadUrl || p.downloadUrl,
              }
            : p
        )
      );

      alert("PDF başarıyla yüklendi.");
    } catch (err: any) {
      console.error("[uploadPdf] error:", err);
      alert(`PDF yüklenemedi: ${err?.message || "bilinmeyen hata"}`);
    } finally {
      setUploadingId(null);
      setPendingUploadId(null);
      // Aynı dosyayı tekrar seçebilmek için input’u sıfırla
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  // ==========================

  const enableScroll = purchases.length > 10;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* gizli file input (tek tane) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="p-4">
        <h2 className="text-xl font-bold text-blue-700 mb-4 text-center">
          Satın Alma Geçmişiniz
        </h2>

        {purchases.length === 0 ? (
          <p className="text-center text-gray-600">
            Henüz satın aldığınız bir paket bulunmamaktadır.
          </p>
        ) : (
          <div className={`${enableScroll ? "max-h-[400px] overflow-y-auto pr-2 custom-scrollbar" : ""}`}>
            <ul className="divide-y divide-gray-200">
              {purchases.map((p) => (
                <li key={p.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-800">
                      {p.type === "gorusme"
                        ? "Görüşme Paketi"
                        : p.type === "dilekce"
                        ? "Dilekçe Paketi"
                        : p.type === "uzman"
                        ? "Uzman Yardımıyla Dilekçe Yazımı"
                        : p.productType || "Bilinmeyen Paket"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Durum: {p.status} <br />
                      Tarih: {formattedDates[p.id] || ""}
                    </p>
                    
                    {p.status === "completed" && p.downloadUrl && (
                      <a href={p.downloadUrl} target="_blank" rel="noopener" className="text-blue-600 underline text-sm">
                        PDF indir
                      </a>
                    )}
                  </div>

                  {p.status === "pending" && (
                    <>
                      {p.type === "dilekce" && (
                        // ✔ Tasarımı bozmamak için iki butonu yan yana, aynı sınıflarla tuttum
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => alert(`AI destekli dilekçe oluşturuluyor... (purchaseId: ${p.id})`)}
                            className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition text-sm"
                          >
                            📄 Dilekçe Yazdır
                          </button>

                          <button
                            onClick={() => openFileDialog(p.id)}
                            disabled={uploadingId === p.id}
                            className={`${uploadingId === p.id ? "bg-gray-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"} text-white px-3 py-1 rounded transition text-sm`}
                          >
                            {uploadingId === p.id ? "Yükleniyor..." : "⬆️ PDF Yükle"}
                          </button>
                        </div>
                      )}

                      {(p.type === "gorusme" || p.type === "uzman") && (
                        <div className="flex flex-col items-end">
                          <button
                            onClick={() => {
                              if (onlineLawyerCount === 0) {
                                alert("Şu anda çevrim içi uzman bulunmamaktadır. Hafta içi 09:00 - 18:00 arasında tekrar deneyin.");
                                return;
                              }
                              onStartChat?.(p.id);
                              onClose();
                            }}
                            disabled={onlineLawyerCount === 0}
                            className={`${onlineLawyerCount === 0
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-blue-600 hover:bg-blue-700"
                              } text-white px-3 py-1 rounded transition text-sm`}
                          >
                            💬 Sohbeti Başlat
                          </button>
                          {onlineLawyerCount === 0 && (
                            <p className="text-xs text-red-600 mt-1 text-right">
                              Şu anda uzman çevrim içi değil.<br />
                              Hafta içi 09:00 - 18:00 saatleri arasında tekrar deneyin.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {p.status === "completed" && (
                    <span className="text-sm text-gray-500 italic">✅ Tamamlandı</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #c1c1c1; border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #a1a1a1; }
      `}</style>
    </Modal>
  );
}
