// src/components/Navbar.tsx
"use client";

import { useEffect, useState } from "react";
import { auth } from "../firebase/config";
import { onAuthStateChanged } from "firebase/auth";
import { logoutUser } from "../firebase/authService";
import { setLawyerOffline, setLawyerOnline } from "../firebase/presenceService";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import Modal from "./Modal";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import PurchaseHistoryModal from "./PurchaseHistoryModal";

type Props = {
  // Satın alma geçmişinden “Sohbeti Başlat” gelince yukarı bildireceğiz
  onStartChatFromHistory?: (purchaseId: string) => void;
};

export default function Navbar({ onStartChatFromHistory }: Props) {
  const [modalType, setModalType] = useState<null | "login" | "register">(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // ➜ Eklendi: Lawyer rolü için yerel state
  const [isLawyer, setIsLawyer] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserEmail(user.email ?? null);

        try {
          const userDoc = await getDoc(doc(getFirestore(), "users", user.uid));
          const role = userDoc.exists() ? userDoc.data().role : undefined;

          if (role === "lawyer") {
            setIsLawyer(true); // ➜ Eklendi
            setLawyerOnline(user.uid, user.email || "");
          } else {
            setIsLawyer(false); // ➜ Eklendi
          }
        } catch {
          setIsLawyer(false); // ➜ Eklendi (hata durumunda gizle)
        }
      } else {
        setUserEmail(null);
        setIsLawyer(false); // ➜ Eklendi
      }
    });
    return () => unsubscribe();
  }, []);

  const closeModal = () => setModalType(null);

  const handleLogout = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const uid = currentUser.uid;
      const userDoc = await getDoc(doc(getFirestore(), "users", uid));
      if (userDoc.exists() && userDoc.data().role === "lawyer") {
        await setLawyerOffline(uid);
      }
    }
    await logoutUser();
    setIsLawyer(false); // ➜ Eklendi: çıkışta da gizle
    setModalType(null);
  };

  return (
    <header className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
        <a href="/" className="text-2xl font-bold text-blue-700">
          HukukDestek
        </a>

        <nav className="space-x-4 text-sm flex items-center">
          <a href="#paketler" className="text-blue-600 hover:underline">Paketler</a>
          <a href="#sss" className="text-blue-600 hover:underline">Sıkça Sorulan Sorular</a>

          {/* ➜ Eklendi: Sadece lawyer'a Panel linki */}
          {isLawyer && (
            <a
              href="/panel"
              className="text-blue-600 hover:underline"
            >
              Panel
            </a>
          )}

          {userEmail ? (
            <>
              <span className="text-gray-800">👤 {userEmail}</span>
              <button
                onClick={() => setShowHistoryModal(true)}
                className="text-blue-600 hover:underline"
              >
                Satın Alma Geçmişi
              </button>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600 transition"
              >
                Çıkış Yap
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setModalType("login")}
                className="text-blue-600 hover:underline"
              >
                Giriş
              </button>
              <button
                onClick={() => setModalType("register")}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                Kayıt Ol
              </button>
            </>
          )}
        </nav>
      </div>

      <Modal isOpen={modalType !== null} onClose={closeModal}>
        {modalType === "login" && (
          <LoginForm
            switchToRegister={() => setModalType("register")}
            onSuccess={closeModal}
          />
        )}
        {modalType === "register" && (
          <RegisterForm
            switchToLogin={() => setModalType("login")}
            onSuccess={closeModal}
          />
        )}
      </Modal>

      {/* Satın Alma Geçmişi modalı (Navbar kontrol ediyor) */}
      <PurchaseHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        onStartChat={(pid) => {
          onStartChatFromHistory?.(pid); // ➜ sayfaya haber ver
        }}
      />
    </header>
  );
}
