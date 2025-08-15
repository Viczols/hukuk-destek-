// src/components/Packages.tsx
"use client";

import { useState, useEffect } from "react";
import { auth, dbRealtime } from "../firebase/config";
import { ref, onValue } from "firebase/database";
import DetailedPackageModal from "./DetailedPackageModal";
import Modal from "./Modal";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";

export default function Packages() {
  const [selectedType, setSelectedType] = useState<null | "dilekce" | "uzman">(null);
  const [modalType, setModalType] = useState<null | "login" | "register">(null);
  const [noLawyerModal, setNoLawyerModal] = useState(false);
  const [onlineLawyerCount, setOnlineLawyerCount] = useState(0);

  // 🔧 RTDB timestamp'larını güvenli millis'e çevir
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

      // ✅ isOnline + son 2 dk içinde heartbeat/lastSeen olanları say
      const count = Object.values<any>(data).filter((lawyer: any) => {
        const isOnline = lawyer?.isOnline === true;
        const hb = toMillis(lawyer?.heartbeatAt);
        const ls = toMillis(lawyer?.lastSeen);
        const fresh = (now - hb) < 120_000 || (now - ls) < 120_000;
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

  const startPayment = async (type: "gorusme" | "dilekce" | "uzman", price: number) => {
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

    localStorage.setItem("pendingPurchaseType", type === "dilekce" ? "dilekce" : "uzman");

    try {
      const productName =
        type === "gorusme"
          ? "Görüşme Paketi"
          : type === "uzman"
          ? "Uzman Yardımıyla Dilekçe Yazımı"
          : "Dilekçe Paketi";

      const response = await fetch("/api/payment/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.email?.split("@")[0],
          userId: user.uid,
          productType: productName,
          productKey: type,
          price,
        }),
      });

      const data = await response.json();
      console.log("create-session yanıtı:", data);

      if (data?.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
      } else {
        alert("Ödeme başlatılamadı: " + (data.errorMessage || data.message || "Bilinmeyen hata"));
      }
    } catch (err) {
      console.error("Ödeme başlatılırken hata:", err);
      alert("Ödeme sırasında bir hata oluştu.");
    }
  };

  const handleBuyClick = (type: "dilekce" | "uzman") => {
    setSelectedType(type);
  };

  return (
    <section id="paketler" className="py-16 bg-gray-50">
      <h2 className="text-3xl font-bold text-center text-blue-800 mb-10">Paketlerimiz</h2>

      <div className="max-w-5xl mx-auto grid gap-10 md:grid-cols-2">
        {/* Yapay Zeka ile Dilekçe Paketi */}
        <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-semibold text-blue-700 mb-2">
              🤖 Yapay Zeka ile Dilekçe Yazımı
            </h3>
            <ul className="text-gray-700 mb-4 space-y-1 list-disc list-inside">
              <li>AI destekli hızlı dilekçe üretimi</li>
              <li>5 dakika uzman danışmanlığı</li>
            </ul>
          </div>
          <button
            onClick={() => handleBuyClick("dilekce")}
            className="mt-auto bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Satın Al
          </button>
        </div>

        {/* Uzman Yardımıyla Dilekçe Yazımı Paketi */}
        <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-semibold text-blue-700 leading-tight">
              📄 Uzman Destekli Dilekçe
            </h3>
            <p
              className={`text-sm px-2 py-1 mt-1 rounded inline-block ${
                onlineLawyerCount > 0
                  ? "text-green-700 bg-green-100"
                  : "text-red-700 bg-red-100"
              }`}
            >
              {onlineLawyerCount > 0
                ? `${onlineLawyerCount} uzman çevrim içi`
                : "Şu an uzman yok"}
            </p>
            <ul className="text-gray-700 mt-2 mb-4 space-y-1 list-disc list-inside">
              <li>Görüşme ile dilekçe hazırlığı</li>
              <li>Uzman desteğiyle PDF olarak teslim</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                if (onlineLawyerCount > 0) {
                  handleBuyClick("uzman");
                }
              }}
              disabled={onlineLawyerCount === 0}
              className={`py-2 rounded transition text-white ${
                onlineLawyerCount > 0
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              Satın Al
            </button>

            {onlineLawyerCount === 0 && (
              <p className="text-xs text-red-600 mt-1 text-center">
                Uzmanlarımız yalnızca <strong>hafta içi 09:00 - 18:00</strong> saatleri arasında hizmet vermektedir.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* DİLEKÇE & UZMAN MODAL */}
      {selectedType && (
        <DetailedPackageModal
          isOpen={true}
          onClose={() => setSelectedType(null)}
          onBuyClick={() =>
            startPayment(selectedType, selectedType === "dilekce" ? 150 : 200)
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

      {/* No Lawyer Modal */}
      <Modal isOpen={noLawyerModal} onClose={() => setNoLawyerModal(false)}>
        <div className="text-center p-4">
          <h2 className="text-xl font-bold text-red-700 mb-2">
            Şu anda çevrim içi uzman bulunmamaktadır
          </h2>
        </div>
      </Modal>
    </section>
  );
}

