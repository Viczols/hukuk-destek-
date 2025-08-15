// src/app/page.tsx
"use client";
import Head from "next/head";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Packages from "../components/Packages";
import Footer from "../components/Footer";
import FAQ from "../components/FAQ";
import ChatButton from "../components/ChatButton";
import ChatBox from "../components/ChatBox";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const lawyersRef = ref(dbRealtime, "lawyers");
    const unsubscribe = onValue(lawyersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const count = Object.values(data).filter(
          (lawyer: any) => lawyer?.isOnline === true || lawyer?.online === true
        ).length;
        setOnlineLawyers(count);
      } else {
        setOnlineLawyers(0);
      }
    }, () => setOnlineLawyers(0));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const db = getFirestore();
        const snap = await getDocs(query(collection(db, "purchases"), where("userId", "==", uid)));
        // debug loglar isteğe bağlı
      } catch {}
    })();
  }, [uid]);

  useEffect(() => {
    const run = async () => {
      if (!uid) { setActivePurchaseId(null); return; }
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
        } catch { return null; }
      };
      let pid = await fetchByStatus("pending");
      if (!pid) pid = await fetchByStatus("active");
      setActivePurchaseId(pid ?? null);
    };
    run();
  }, [uid]);

  // Navbar’daki modal “Sohbeti Başlat” dediğinde
  const handleStartChatFromHistory = (purchaseId: string) => {
    setActivePurchaseId(purchaseId);
    setChatOpen(true);
  };

return (
    <main>
      {/* Google Font */}
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      {/* Opsiyonel kök: Modal.tsx yoksa body'ye taşır; varsa buraya render eder */}
      <div id="modal-root" />

      <Navbar /* onStartChatFromHistory vs. mevcut prop'ların aynen kalsın */ />

      <Hero />
      <Packages />
      <FAQ />
      <Footer />

      {/* PurchaseSuccessModal + Chat parçaların aynı kalsın */}

      {/* Global tipografi ve smooth scroll */}
      <style jsx global>{`
        html { scroll-behavior: smooth; }
        body {
          font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          font-size: 15.5px; /* bir tık büyüttüm */
          color: #0a0a0a;
        }
        h1 { font-size: clamp(2rem, 3.5vw, 2.75rem); line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; }
        h2 { font-size: clamp(1.5rem, 2.5vw, 2rem); line-height: 1.2;  font-weight: 600; letter-spacing: -0.005em; }
        p  { line-height: 1.7; }
        button { font-weight: 600; }
      `}</style>
    </main>
  );
}