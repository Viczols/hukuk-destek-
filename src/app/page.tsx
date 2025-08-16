// src/app/page.tsx
"use client";

import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Packages from "../components/Packages";
import Footer from "../components/Footer";
import FAQ from "../components/FAQ";
import ChatButton from "../components/ChatButton";
import ChatBox from "../components/ChatBox";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";

// YENİ: Blog bileşeni
import BlogSection from "../components/BlogSection";

import { useEffect, useState } from "react";
import { dbRealtime, auth } from "../firebase/config";
import { ref, onValue } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

export default function Anasayfa() {
  const [chatOpen, setChatOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successType, setSuccessType] = useState<"dilekce" | "uzman" | null>(null);
  const [onlineLawyers, setOnlineLawyers] = useState(0);
  const [uid, setUid] = useState<string | null>(null);
  const [activePurchaseId, setActivePurchaseId] = useState<string | null>(null);

  // Satın alma başarılıysa bir kere göster
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("purchaseSuccess") : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.shown) {
          setShowSuccessModal(true);
          setSuccessType(parsed.type || null);
          localStorage.setItem("purchaseSuccess", JSON.stringify({ ...parsed, shown: true }));
        }
      }
    } catch {}
  }, []);

  // auth → uid
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // online avukat sayısı (realtime)
  useEffect(() => {
    const lawyersRef = ref(dbRealtime, "lawyers");
    const unsubscribe = onValue(
      lawyersRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const count = Object.values(data).filter(
            (lawyer: any) => lawyer?.isOnline === true || lawyer?.online === true
          ).length;
          setOnlineLawyers(count);
        } else {
          setOnlineLawyers(0);
        }
      },
      () => setOnlineLawyers(0)
    );
    return () => unsubscribe();
  }, []);

  // (opsiyonel) purchases query (log için bırakılmış)
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const db = getFirestore();
        await getDocs(query(collection(db, "purchases"), where("userId", "==", uid)));
      } catch {}
    })();
  }, [uid]);

  // pending/active satın alma → chat açma için id
  useEffect(() => {
    const run = async () => {
      if (!uid) {
        setActivePurchaseId(null);
        return;
      }
      const db = getFirestore();

      const fetchByStatus = async (statusVal: "pending" | "active") => {
        try {
          const qRef = query(
            collection(db, "purchases"),
            where("userId", "==", uid),
            where("status", "==", statusVal)
          );
          const snap = await getDocs(qRef);
          if (snap.empty) return null;

          const wanted = new Set(["gorusme", "uzman"]);
          const docs = snap.docs
            .map((d) => {
              const data: any = d.data();
              const t = String(data.type ?? data.productKey ?? "").toLowerCase();
              const ts: number = (data.createdAt?.toMillis?.() ?? data.date?.toMillis?.() ?? 0) as number;
              return { id: d.id, t, ts };
            })
            .filter((x) => wanted.has(x.t))
            .sort((a, b) => b.ts - a.ts);

          return docs[0]?.id ?? null;
        } catch {
          return null;
        }
      };

      let pid = await fetchByStatus("pending");
      if (!pid) pid = await fetchByStatus("active");
      setActivePurchaseId(pid ?? null);
    };
    run();
  }, [uid]);

  // Navbar’daki “Sohbeti Başlat” gelince
  const handleStartChatFromHistory = (purchaseId: string) => {
    setActivePurchaseId(purchaseId);
    setChatOpen(true);
  };

  // YENİ: Blog verisi (şimdilik mock; panel bağlanınca Firestore’dan gelecek)
  const blogMock = [
    {
      id: "1",
      slug: "is-akdinde-fesih-sureci",
      title: "İş Akdinde Fesih Süreci: Dikkat Edilmesi Gerekenler",
      excerpt:
        "İş akdi fesih sürecinde işveren ve işçinin hakları, süreler ve tazminatlar...",
      coverUrl: "/images/istockphoto-1328608958-612x612.jpg",
      tags: ["iş-hukuku", "fesih"],
      publishedAtText: "2 gün önce",
    },
    {
      id: "2",
      slug: "kira-uyusmazliklarinda-yeni-yol-haritasi",
      title: "Kira Uyuşmazlıklarında Yeni Yol Haritası",
      excerpt:
        "Arabuluculuk şartı, tahliye davası, kira tespiti ve pratik öneriler...",
      coverUrl: "/images/ChatGPT Image 15 Ağu 2025 16_18_37.png",
      tags: ["gayrimenkul", "arabuluculuk"],
      publishedAtText: "1 hafta önce",
    },
    {
      id: "3",
      slug: "miras-planlamasi-icin-ipuclari",
      title: "Miras Planlaması İçin 7 İpucu",
      excerpt:
        "Vasiyetname, saklı pay, miras sözleşmesi… Hangi adımlar riski azaltır?",
      coverUrl: "/images/ChatGPT Image 15 Ağu 2025 16_15_57.png",
      tags: ["miras", "aile-hukuku"],
      publishedAtText: "12 gün önce",
    },
  ];

  return (
    <main>
      <Navbar onStartChatFromHistory={handleStartChatFromHistory} />

      <Hero />
      <Packages />

      {/* YENİ: Blog – Paketler'in hemen altında */}
      <BlogSection posts={blogMock} />

      <FAQ />
      <Footer />

      <PurchaseSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        type={successType}
        onlineLawyers={onlineLawyers}
      />

      {activePurchaseId && (
        <>
          <ChatButton onClick={() => setChatOpen(true)} expertOnline={onlineLawyers > 0} />
          {chatOpen && (
            <ChatBox
              onClose={() => setChatOpen(false)}
              expertName="Uzman"
              expertOnline={onlineLawyers > 0}
              purchaseId={activePurchaseId}
              userId={uid || ""}
            />
          )}
        </>
      )}
    </main>
  );
}
