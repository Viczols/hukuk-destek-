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
import { usePathname } from "next/navigation";
import Link from "next/link"; // ✅ Link import edildi

type HideKey =
  | "danismanlik"
  | "paketler"
  | "blog"
  | "sss"
  | "panel"
  | "history"
  | "auth";

type Props = {
  onStartChatFromHistory?: (purchaseId: string) => void;
  variant?: "default" | "consulting";
  hideLinks?: HideKey[];
  extraLeft?: React.ReactNode;
  extraRight?: React.ReactNode;
};

export default function Navbar({
  onStartChatFromHistory,
  variant = "default",
  hideLinks = [],
  extraLeft,
  extraRight,
}: Props) {
  const [modalType, setModalType] = useState<null | "login" | "register">(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isLawyer, setIsLawyer] = useState(false);
  const pathname = usePathname();
  const showGlow = variant === "consulting" || pathname === "/";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserEmail(user.email ?? null);
        try {
          const userDoc = await getDoc(doc(getFirestore(), "users", user.uid));
          const role = userDoc.exists() ? userDoc.data().role : undefined;
          if (role === "lawyer") {
            setIsLawyer(true);
            setLawyerOnline(user.uid, user.email || "");
          } else {
            setIsLawyer(false);
          }
        } catch {
          setIsLawyer(false);
        }
      } else {
        setUserEmail(null);
        setIsLawyer(false);
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
    setIsLawyer(false);
    setModalType(null);
  };

  const isHidden = (k: HideKey) => hideLinks.includes(k);

  const consultingClass =
    variant === "consulting"
      ? `
        group relative px-4 py-2 rounded-full font-semibold
        text-white bg-zinc-900/90
        border border-white/10
        shadow-[0_6px_20px_rgba(0,0,0,.25)]
        transition-all duration-200
        hover:-translate-y-0.5 hover:bg-zinc-900
      `
      : `
        group relative px-4 py-2 rounded-full font-semibold
        text-white bg-zinc-900/90
        border border-white/10
        shadow-[0_6px_20px_rgba(0,0,0,.25)]
        transition-all duration-200
        hover:-translate-y-0.5 hover:bg-zinc-900
      `;

  return (
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex justify-between items-center">
        {/* Sol taraf (Logo + optional extraLeft) */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-zinc-900"
          >
            HukukDestek
          </Link>
          {extraLeft}
        </div>

        {/* NAV */}
        <nav className="hidden md:flex items-center gap-2 text-sm">
          {!isHidden("danismanlik") && (
            <Link href="/danismanlik" className={consultingClass}>
              {showGlow && (
                <span
                  className="
                    pointer-events-none absolute inset-0 rounded-full
                    bg-[radial-gradient(120px_60px_at_center,rgba(99,102,241,.35),transparent)]
                    opacity-0 group-hover:opacity-100 transition-opacity
                  "
                  aria-hidden
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="opacity-90"
                >
                  <path
                    d="M20 12c0 3.866-3.582 7-8 7-1.043 0-2.04-.16-2.957-.45L4 20l1.45-4.957C5.16 14.126 5 13.13 5 12c0-3.866 3.582-7 8-7s7 3.134 7 7Z"
                    fill="currentColor"
                  />
                </svg>
                <span>Online Danışmanlık</span>
              </span>
            </Link>
          )}

          {!isHidden("paketler") && (
            <a
              href="#paketler"
              className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
            >
              Paketler
            </a>
          )}

          {!isHidden("blog") && (
            <a
              href="#blog"
              className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
            >
              Blog
            </a>
          )}

          {!isHidden("sss") && (
            <a
              href="#sss"
              className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
            >
              SSS
            </a>
          )}

          {isLawyer && !isHidden("panel") && (
            <Link
              href="/panel"
              className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
            >
              Panel
            </Link>
          )}

          {extraRight}

          {!isHidden("history") && userEmail && (
            <button
              onClick={() => setShowHistoryModal(true)}
              className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
            >
              Satın Alma Geçmişi
            </button>
          )}

          {userEmail ? (
            <>
              <span className="px-3 py-2 text-zinc-700 hidden lg:inline">
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
              >
                Çıkış
              </button>
            </>
          ) : (
            !isHidden("auth") && (
              <>
                <button
                  onClick={() => setModalType("login")}
                  className="px-3 py-2 rounded-full hover:bg-zinc-100 transition-colors"
                >
                  Giriş
                </button>
                <button
                  onClick={() => setModalType("register")}
                  className="px-4 py-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
                >
                  Kayıt Ol
                </button>
              </>
            )
          )}
        </nav>
      </div>

      {/* Auth modalları */}
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

      {/* Satın Alma Geçmişi modalı */}
      <PurchaseHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        onStartChat={(pid) => {
          onStartChatFromHistory?.(pid);
        }}
      />
    </header>
  );
}
