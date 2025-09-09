"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import AIDilekceModal from "../app/AIDilekce/AIDilekceModal"; // ← YENİ: AI sihirbaz modalı
import { auth, dbRealtime } from "../firebase/config";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  // ticket oluşturmak için
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot, // ← ai.state takibi için
} from "firebase/firestore";
import { ref as rtdbRef, onValue, set as rtdbSet } from "firebase/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStartChat?: (purchaseId: string) => void;
}

interface Purchase {
  id: string;
  type: string;
  productKey?: string | null;
  productType?: string;
  status: string;
  createdAt: number;
  storagePath?: string;
  downloadUrl?: string;
  deliveredPdfUrl?: string | null;
}

/* ------------------------------------------------------------------ */
function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") {
    try { return v.toDate().getTime(); } catch {}
  }
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

function productLabel(key?: string | null, type?: string | null) {
  const k = String((key || type || "")).toLowerCase();
  switch (k) {
    case "uzman":
    case "uzman-yardimi":
    case "uzman_yardimi":
      return "Uzman Yardımıyla Dilekçe Yazımı";
    case "dilekce":
    case "ai":
    case "ai-dilekce":
      return "Yapay Zekâ ile Dilekçe Yazımı";
    case "gorusme":
    case "uzman-gorusmesi":
      return "Uzmanla Görüşme";
    default:
      return type || key || "Paket";
  }
}

type NormalizedStatus = "pending" | "completed" | "failed";
function normalizeStatus(raw?: string): NormalizedStatus {
  const s = (raw || "").toLowerCase().trim();
  if (["pending","beklemede","hazırlanıyor","hazirlaniyor","hazirlanıyor","processing","created","open","awaiting_payment","awaiting","in_progress"].includes(s)) return "pending";
  if (["completed","paid","success","başarılı","basarili","tamamlandı","tamamlandi","ödendi","odendi","done"].includes(s)) return "completed";
  if (["failed","error","iptal","canceled","cancelled","başarısız","basarisiz","refused"].includes(s)) return "failed";
  return "pending";
}
function statusLabelTr(norm: NormalizedStatus, isAI: boolean) {
  if (norm === "pending") return isAI ? "hazırlanıyor" : "beklemede";
  if (norm === "completed") return "tamamlandı";
  if (norm === "failed") return "başarısız";
  return "beklemede";
}

function ClientTime({ ms }: { ms: number }) {
  const [txt, setTxt] = useState<string>("");
  useEffect(() => { if (ms) setTxt(new Date(ms).toLocaleString()); }, [ms]);
  return <>{txt || "-"}</>;
}
/* ------------------------------------------------------------------*/

export default function PurchaseHistoryModal({ isOpen, onClose, onStartChat }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [formattedDates, setFormattedDates] = useState<Record<string, string>>({});
  const [onlineLawyerCount, setOnlineLawyerCount] = useState(0);

  const [aiStates, setAiStates] = useState<Record<string, string>>({});
  const [aiModalPurchaseId, setAiModalPurchaseId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // --- Realtime: online uzman
  useEffect(() => {
    const lawyersRef = rtdbRef(dbRealtime, "lawyers");
    const unsubscribe = onValue(lawyersRef, (snap) => {
      if (!snap.exists()) return setOnlineLawyerCount(0);
      const data = snap.val() || {};
      const count = Object.values<any>(data).filter((l) => l?.isOnline).length;
      setOnlineLawyerCount(count);
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore: purchases
  useEffect(() => {
    const fetchPurchases = async () => {
      if (!auth.currentUser) return;
      const db = getFirestore();
      const q = query(
        collection(db, "purchases"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const list: Purchase[] = snapshot.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          type: data.productKey || data.type || "dilekce",
          productKey: data.productKey ?? null,
          productType: data.productType || "",
          status: data.status ?? "pending",
          createdAt: toMillis(data.createdAt),
          storagePath: data.deliveredPdfPath || data.storagePath || "",
          downloadUrl: data.downloadUrl || "",
          deliveredPdfUrl: data.deliveredPdfUrl ?? null,
        };
      });
      setPurchases(list);
    };
    if (isOpen) fetchPurchases();
  }, [isOpen]);

  // --- Tarihler
  useEffect(() => {
    const mapping: Record<string, string> = {};
    purchases.forEach((p) => (mapping[p.id] = p.createdAt ? new Date(p.createdAt).toLocaleString() : "-"));
    setFormattedDates(mapping);
  }, [purchases]);

  // --- Her satın alma için ai.state'i canlı dinle
  useEffect(() => {
    if (purchases.length === 0) return;
    const db = getFirestore();
    const unsubs = purchases.map((p) => {
      const ref = doc(db, "purchases", p.id, "meta", "ai");
      return onSnapshot(ref, (snap) => {
        const st = (snap.data()?.state as string) || "idle";
        setAiStates((prev) => (prev[p.id] === st ? prev : { ...prev, [p.id]: st }));
      });
    });
    return () => unsubs.forEach((u) => u && u());
  }, [purchases]);

  const openAIModal = (pid: string) => setAiModalPurchaseId(pid);
  const closeAIModal = () => setAiModalPurchaseId(null);

  // --- Chat (mevcut)
  async function ensureTicketForPurchase(purchaseId: string) {
    if (!auth.currentUser) throw new Error("Oturum bulunamadı.");
    const db = getFirestore();

    const pRef = doc(db, "purchases", purchaseId);
    const pSnap = await getDoc(pRef);
    if (!pSnap.exists()) throw new Error("Satın alma bulunamadı.");
    const pdata: any = pSnap.data() || {};
    const userId = pdata.userId || auth.currentUser.uid;
    const productKey = pdata.productKey || pdata.type || "uzman";
    const productType = pdata.productType || productLabel(productKey, pdata.productType);

    const tRef = doc(db, "tickets", purchaseId);
    await setDoc(
      tRef,
      {
        purchaseId,
        userId,
        productKey,
        productType,
        status: "waiting",
        assignedLawyerId: null,
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await rtdbSet(rtdbRef(dbRealtime, `tickets/${purchaseId}`), {
        purchaseId,
        userId,
        productKey,
        productType,
        status: "waiting",
        assignedLawyerId: null,
        createdAt: Date.now(),
      });
    } catch {}
  }
  const handleStartChat = async (pid: string) => {
    if (onlineLawyerCount === 0) {
      alert("Şu anda çevrim içi uzman bulunmuyor. Hafta içi 09:00–18:00 arasında tekrar deneyebilirsiniz.");
      return;
    }
    try {
      await ensureTicketForPurchase(pid);
      onStartChat?.(pid);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Sohbet başlatılamadı: ${err?.message || "bilinmeyen hata"}`);
    }
  };

  // --- PDF Upload (mevcut)
  function openFileDialog(purchaseId: string) {
    setPendingUploadId(purchaseId);
    fileInputRef.current?.click();
  }
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Lütfen PDF dosyası seçin.");
      e.target.value = "";
      return;
    }
    const purchaseId = pendingUploadId;
    if (!purchaseId) return;

    try {
      setUploadingId(purchaseId);
      const fd = new FormData();
      fd.append("purchaseId", purchaseId);
      fd.append("file", file);

      const res = await fetch("/api/upload-petition", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Yükleme başarısız");

      setPurchases((prev) =>
        prev.map((p) =>
          p.id === purchaseId
            ? {
                ...p,
                status: "completed",
                storagePath: data.storagePath || p.storagePath,
                downloadUrl: data.downloadUrl || p.downloadUrl,
                deliveredPdfUrl: data.deliveredPdfUrl || data.pdfUrl || p.deliveredPdfUrl || null,
              }
            : p
        )
      );
      alert("PDF başarıyla yüklendi.");
    } catch (err: any) {
      console.error(err);
      alert(`PDF yüklenemedi: ${err?.message || "bilinmeyen hata"}`);
    } finally {
      setUploadingId(null);
      setPendingUploadId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const enableScroll = purchases.length > 10;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* gizli upload input */}
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileSelected} />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-center text-[18px] font-semibold text-white">Satın Alma Geçmişiniz</h2>
          <p className="mt-1 text-center text-sm text-zinc-400">
            Geçmiş işlemlerinizi görüntüleyin, PDF indirin (varsa) veya uzmanla sohbeti başlatın.
          </p>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Liste */}
        {purchases.length === 0 ? (
          <p className="text-center text-zinc-400 py-10">Henüz satın aldığınız bir paket bulunmuyor.</p>
        ) : (
          <div className={`${enableScroll ? "max-h-[460px] overflow-y-auto pr-1 custom-scrollbar-dark" : ""} px-4 py-2`}>
            <ul className="divide-y divide-white/10">
              {purchases.map((p) => {
                const key = (p.productKey || p.type || "").toLowerCase();
                const isAI = ["dilekce", "ai", "ai-dilekce"].includes(key);
                const isUzman = key === "uzman";
                const isGorusme = key === "gorusme";

                const norm = normalizeStatus(p.status);
                const isCompleted = norm === "completed";
                const isPending = norm === "pending";
                const isFailed = norm === "failed";
                const statusText = statusLabelTr(norm, isAI);

                const title = productLabel(p.productKey, p.productType);
                const pdfUrl = p.deliveredPdfUrl || p.downloadUrl || "";

                const aiState = aiStates[p.id] || "idle";
                const showAIBtn = isAI && isPending && aiState !== "awaiting_review";
                const showAIReviewBadge = isAI && aiState === "awaiting_review";

                return (
                  <li key={p.id} className="py-3 flex items-start justify-between gap-4">
                    {/* Sol */}
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-100">{title}</p>
                      <p className="text-sm text-zinc-400 mt-0.5">
                        Durum:{" "}
                        <span
                          className={
                            isCompleted ? "text-emerald-300" : isPending ? "text-amber-300" : isFailed ? "text-rose-300" : "text-zinc-300"
                          }
                        >
                          {statusText}
                        </span>{" "}
                        • Tarih: <ClientTime ms={p.createdAt} />
                      </p>

                      {/* PDF indir: yalnızca TAMAMLANDI ve URL varsa */}
                      {isCompleted && pdfUrl && (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white mt-1"
                          title="PDF'i indir / aç"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current">
                            <path d="M12 3a1 1 0 0 1 1 1v9.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.007 4.007a1.5 1.5 0 0 1-2.121 0L6.572 12.707a1 1 0 0 1 1.414-1.414L10.28 13.59V4a1 1 0 0 1 1-1z" />
                            <path d="M5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2a1 1 0 1 0-2 0v2H7v-2a1 1 0 0 0-1 1z" />
                          </svg>
                          PDF’i indir
                        </a>
                      )}
                    </div>

                    {/* Sağ: rozet / aksiyonlar */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                          <svg width="14" height="14" viewBox="0 0 24 24" className="fill-current">
                            <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                          Tamamlandı
                        </span>
                      )}

                      {/* AI - Avukat inceleme rozeti */}
                      {showAIReviewBadge && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300">
                          <svg width="14" height="14" viewBox="0 0 24 24" className="fill-current">
                            <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm1 15h-2v-2h2zm0-4h-2V7h2z" />
                          </svg>
                          İncelemede
                        </span>
                      )}

                      {/* AI - Dilekçeyi Yazdır (modal) */}
                      {showAIBtn && (
                        <button
                          onClick={() => openAIModal(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-200"
                          title="Yapay zekâ ile dilekçe oluştur"
                        >
                          ✍️ Dilekçeyi Yazdır
                        </button>
                      )}

                      {/* Görüşme/Uzman paketi için sohbet */}
                      {normalizeStatus(p.status) === "pending" && (isGorusme || isUzman) && (
                        <button
                          onClick={() => handleStartChat(p.id)}
                          disabled={onlineLawyerCount === 0}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                            onlineLawyerCount > 0
                              ? "bg-white text-zinc-900 hover:bg-zinc-200"
                              : "bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-700"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" className="fill-current">
                            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
                          </svg>
                          Sohbeti Başlat
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* AI MODAL */}
      {aiModalPurchaseId && (
        <AIDilekceModal
          open={true}
          purchaseId={aiModalPurchaseId}
          onClose={closeAIModal}
        />
      )}

      {/* koyu scrollbar */}
      <style jsx global>{`
        .custom-scrollbar-dark::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: rgba(255,255,255,0.06); border-radius: 8px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.25); border-radius: 8px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.35); }
      `}</style>
    </Modal>
  );
}
