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

// Blog
import BlogSection from "../components/BlogSection";
import { BlogPost } from "../types/blog"; // BlogSection'ın beklediği tipe uygun

import { useEffect, useState } from "react";
import { dbRealtime, auth } from "../firebase/config";
import { ref, onValue } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";

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

  // --- BLOG: Firestore'dan yayınlanmış yazıları çek ---
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogLoading, setBlogLoading] = useState<boolean>(true);

useEffect(() => {
  (async () => {
    try {
      setBlogLoading(true);
      const db = getFirestore();
      // ÖNCE hızlı yol (index varsa):
      try {
        const qRef = query(
          collection(db, "posts"),
          where("status", "==", "published"),
          orderBy("publishedAt", "desc"),
          limit(12)
        );
        const snap = await getDocs(qRef);
        setBlogPosts(mapPosts(snap.docs));
      } catch (err: any) {
        // Index yoksa fallback: orderBy'sız çek → client-side sort
        const qRef = query(
          collection(db, "posts"),
          where("status", "==", "published")
        );
        const snap = await getDocs(qRef);
        const list = mapPosts(snap.docs);
        list.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
        setBlogPosts(list.slice(0, 12));
      }
    } finally {
      setBlogLoading(false);
    }
  })();

  function toMs(v: any, fallback = 0) {
    return typeof v === "number" ? v : (v?.toMillis?.() ?? fallback);
  }
  function mapPosts(docs: any[]): BlogPost[] {
    const fmt = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
    const daysDiff = (ms: number) => Math.round((ms - Date.now()) / (1000 * 60 * 60 * 24));
    return docs.map((d: any) => {
      const data = d.data();
      const publishedAt = toMs(data.publishedAt, 0);
      const createdAt = toMs(data.createdAt, publishedAt || Date.now());
      const updatedAt = toMs(data.updatedAt, publishedAt || createdAt);
      const excerpt =
        data.excerpt ??
        (String(data.content ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 180) + (String(data.content ?? "").length > 180 ? "…" : ""));
      return {
        id: d.id,
        slug: data.slug,
        title: data.title,
        excerpt,
        coverUrl: data.coverUrl,
        tags: data.tags ?? [],
        publishedAtText: publishedAt ? fmt.format(daysDiff(publishedAt), "day") : "Yeni",
        content: data.content ?? "",
        status: (data.status as "draft" | "published") ?? "published",
        authorId: data.authorId ?? "",
        createdAt,
        updatedAt,
        publishedAt,
        authorName: data.authorName ?? undefined,
      } as BlogPost;
    });
  }
}, []);


  return (
    <main>
      <Navbar onStartChatFromHistory={handleStartChatFromHistory} />

      <Hero />
      <Packages />

      {/* Blog – Paketler'in hemen altında */}
      <div className="relative bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-900">
        <BlogSection posts={blogPosts} />
        <FAQ />
        <Footer />
      </div>

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
