"use client";

import React, { useEffect, useState } from "react";
import Modal from "./Modal";
import { auth } from "../firebase/config";
import { getFirestore, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { dbRealtime } from "../firebase/config";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // ✅ yeni: geçmişten “Sohbeti Başlat” tıklanınca dışarı bildirmek için
  onStartChat?: (purchaseId: string) => void;
}

interface Purchase {
  id: string;
  type: string;
  status: string;
  createdAt: number;
  productType?: string;
}

export default function PurchaseHistoryModal({ isOpen, onClose, onStartChat }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [formattedDates, setFormattedDates] = useState<Record<string, string>>({});
  const [onlineLawyerCount, setOnlineLawyerCount] = useState(0);

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
        productType: doc.data().productType || ""
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
    // ✅ parent’a bildir ve modalı kapat
    onStartChat?.(purchaseId);
    onClose();
  };

  const handleGeneratePetition = (purchaseId: string) => {
    alert(`AI destekli dilekçe oluşturuluyor... (purchaseId: ${purchaseId})`);
  };

  const enableScroll = purchases.length > 10;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
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
                  </div>

                  {p.status === "pending" && (
                    <>
                      {p.type === "dilekce" && (
                        <button
                          onClick={() => handleGeneratePetition(p.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition text-sm"
                        >
                          📄 Dilekçe Yazdır
                        </button>
                      )}

                      {(p.type === "gorusme" || p.type === "uzman") && (
                        <div className="flex flex-col items-end">
                          <button
                            onClick={() => handleStartChat(p.id)}
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
