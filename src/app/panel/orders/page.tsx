"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  DocumentData,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { dbFirestore as db, auth } from "../../../firebase/config";

/* ================== Tipler ================== */
type Purchase = {
  id: string;
  userId: string;
  productType: "uzman" | "ai" | string;
  status: "pending" | "in_progress" | "completed" | "hazırlanıyor" | string;
  assignedLawyerId?: string | null;
  deliveredPdfUrl?: string | null;
  userEmail?: string | null;
  createdAt?: any;
  chatId?: string | null;

  // AI meta
  aiState?: string | null;
  aiDraftDocxUrl?: string | null;
  aiDraftPdfUrl?: string | null;
};

type SortDir = "desc" | "asc";

// Aktif grup
const ACTIVE_SET = new Set(["pending", "in_progress", "hazırlanıyor"]);

// Bu ürünler “AI dilekçe”
const isAIProduct = (t?: string | null) =>
  ["ai", "dilekce", "ai-dilekce", "dilekçe"].includes(String(t || "").toLowerCase());

/* ================== Sayfa ================== */
export default function OrdersPage() {
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bekleyen (atanmamış) AI taslaklar
  const [aiQueue, setAiQueue] = useState<Purchase[]>([]);

  // upload UI state
  
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [inputKey, setInputKey] = useState<Record<string, number>>({});
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({}); // görsel amaçlı

  // e-posta önbellek
  const emailCacheRef = useRef<Map<string, string | null>>(new Map());

  // purchases + chatTickets birleştirme
  const mergedMapRef = useRef<Map<string, Purchase>>(new Map());
  const ticketPurchaseUnsubsRef = useRef<Map<string, () => void>>(new Map());

  // Sıralama yönü (yeni → eski “desc” varsayılan)
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let stopAuth = () => {};
    let unsubPurchasesActive = () => {};
    let unsubPurchasesCompleted = () => {};
    let unsubTickets = () => {};
    let unsubAiAwaiting = () => {};

    stopAuth = onAuthStateChanged(auth, (u) => {
      // reset
      for (const unsub of ticketPurchaseUnsubsRef.current.values()) unsub();
      ticketPurchaseUnsubsRef.current.clear();
      mergedMapRef.current.clear();
      setOrders([]);
      setAiQueue([]);

      if (!u) return;

      // 1) Aktif siparişler
      const qActive = query(
        collection(db, "purchases"),
        where("assignedLawyerId", "==", u.uid),
        where("status", "in", ["pending", "in_progress", "hazırlanıyor"])
      );
      unsubPurchasesActive = onSnapshot(
        qActive,
        (snap) => {
          const map = mergedMapRef.current;
          snap.forEach((d) => {
            const data = d.data() as DocumentData;
            const p: Purchase = {
              id: d.id,
              userId: data.userId,
              productType: data.productType ?? data.productKey ?? "",
              status: data.status ?? "",
              assignedLawyerId: data.assignedLawyerId ?? null,
              deliveredPdfUrl: data.deliveredPdfUrl ?? null,
              userEmail: data.userEmail ?? null,
              createdAt: data.createdAt ?? null,
              chatId: data.chatId ?? null,
              aiState: data?.meta?.ai?.state ?? null,
              aiDraftDocxUrl: data?.meta?.ai?.draftDocxUrl ?? null,
              aiDraftPdfUrl: data?.meta?.ai?.draftPdfUrl ?? null,
            };
            map.set(p.id, p);
          });
          setOrders(sortAll(Array.from(map.values()), sortDir));
          warmEmails(Array.from(mergedMapRef.current.values()));
        },
        (err) => console.error("[orders] purchases active query error:", err)
      );

      // 2) Tamamlanmış siparişler
      const qCompleted = query(
        collection(db, "purchases"),
        where("assignedLawyerId", "==", u.uid),
        where("status", "==", "completed")
      );
      unsubPurchasesCompleted = onSnapshot(
        qCompleted,
        (snap) => {
          const map = mergedMapRef.current;
          snap.forEach((d) => {
            const data = d.data() as DocumentData;
            const p: Purchase = {
              id: d.id,
              userId: data.userId,
              productType: data.productType ?? data.productKey ?? "",
              status: data.status ?? "",
              assignedLawyerId: data.assignedLawyerId ?? null,
              deliveredPdfUrl: data.deliveredPdfUrl ?? null,
              userEmail: data.userEmail ?? null,
              createdAt: data.createdAt ?? null,
              chatId: data.chatId ?? null,
              aiState: data?.meta?.ai?.state ?? null,
              aiDraftDocxUrl: data?.meta?.ai?.draftDocxUrl ?? null,
              aiDraftPdfUrl: data?.meta?.ai?.draftPdfUrl ?? null,
            };
            map.set(p.id, p);
          });
          setOrders(sortAll(Array.from(map.values()), sortDir));
          warmEmails(Array.from(mergedMapRef.current.values()));
        },
        (err) => console.error("[orders] purchases completed query error:", err)
      );

      // 3) chatTickets fallback
      const ENABLE_TICKETS_FALLBACK = true;
      if (ENABLE_TICKETS_FALLBACK) {
        const qTickets = query(collection(db, "chatTickets"), where("assignedLawyer", "==", u.uid));
        unsubTickets = onSnapshot(
          qTickets,
          (snap) => {
            const nextTicketIds = new Set<string>();
            snap.forEach((d) => {
              const purchaseId = d.id; // chatTickets doc id == purchaseId varsayımı
              if (purchaseId) nextTicketIds.add(purchaseId);
            });

            // kaldırılanların aboneliklerini temizle
            for (const [pid, unsub] of ticketPurchaseUnsubsRef.current) {
              if (!nextTicketIds.has(pid)) {
                unsub();
                ticketPurchaseUnsubsRef.current.delete(pid);
              }
            }

            // yeni ticket id’leri için purchases/<pid> dinle
            for (const pid of nextTicketIds) {
              if (ticketPurchaseUnsubsRef.current.has(pid)) continue;

              const unsub = onSnapshot(
                doc(db, "purchases", pid),
                (pd) => {
                  if (!pd.exists()) return;
                  const data = pd.data() as any;

                  const p: Purchase = {
                    id: pd.id,
                    userId: data.userId,
                    productType: data.productType ?? data.productKey ?? "",
                    status: data.status ?? "",
                    assignedLawyerId: data.assignedLawyerId ?? null,
                    deliveredPdfUrl: data.deliveredPdfUrl ?? null,
                    userEmail: data.userEmail ?? null,
                    createdAt: data.createdAt ?? null,
                    chatId: data.chatId ?? null,
                    aiState: data?.meta?.ai?.state ?? null,
                    aiDraftDocxUrl: data?.meta?.ai?.draftDocxUrl ?? null,
                    aiDraftPdfUrl: data?.meta?.ai?.draftPdfUrl ?? null,
                  };
                  mergedMapRef.current.set(pid, p);
                  setOrders(sortAll(Array.from(mergedMapRef.current.values()), sortDir));
                  warmEmails([p]);
                },
                (err) => console.error("[orders] purchase-by-ticket listen error:", err)
              );
              ticketPurchaseUnsubsRef.current.set(pid, unsub);
            }
          },
          (err) => console.error("[orders] tickets query error:", err)
        );
      }

      // 4) Bekleyen AI Taslaklar (atanmamış havuz) → awaiting_review
      const qAiAwaiting = query(
        collection(db, "purchases"),
        where("meta.ai.state", "==", "awaiting_review")
      );
      unsubAiAwaiting = onSnapshot(
        qAiAwaiting,
        (snap) => {
          const list: Purchase[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            if (data.assignedLawyerId) return;

            const key = String(data.productType ?? data.productKey ?? data.type ?? "").toLowerCase();
            const isAI = isAIProduct(key);
            if (!isAI) return;

            list.push({
              id: d.id,
              userId: data.userId,
              productType: data.productType ?? data.productKey ?? "",
              status: data.status ?? "",
              assignedLawyerId: data.assignedLawyerId ?? null,
              deliveredPdfUrl: data.deliveredPdfUrl ?? null,
              userEmail: data.userEmail ?? null,
              createdAt: data.createdAt ?? null,
              chatId: data.chatId ?? null,
              aiState: data?.meta?.ai?.state ?? null,
              aiDraftDocxUrl: data?.meta?.ai?.draftDocxUrl ?? null,
              aiDraftPdfUrl: data?.meta?.ai?.draftPdfUrl ?? null,
            });
          });

          // Sıralamayı panele göre uygula
          const sorted = sortByTime(list, sortDir);
          setAiQueue(sorted);
          warmEmails(sorted);
        },
        (err) => console.error("[orders] ai-awaiting query error:", err)
      );
    });

    return () => {
      unsubPurchasesActive();
      unsubPurchasesCompleted();
      unsubTickets();
      unsubAiAwaiting();
      for (const unsub of ticketPurchaseUnsubsRef.current.values()) unsub();
      ticketPurchaseUnsubsRef.current.clear();
      stopAuth();
    };
  }, [sortDir]);

  /* ================== Sıralama yardımcıları ================== */

  // Zaman sıralama (createdAt’a göre)
  const sortByTime = (arr: Purchase[], dir: SortDir) => {
    return arr.slice().sort((a, b) => {
      const at = (a as any).createdAt?.toMillis?.() ?? 0;
      const bt = (b as any).createdAt?.toMillis?.() ?? 0;
      if (at !== bt) return dir === "desc" ? bt - at : at - bt;
      return a.id.localeCompare(b.id);
    });
  };

  // Tüm liste: önce statü, sonra zamana göre (seçili yöne göre)
  const sortAll = (arr: Purchase[], dir: SortDir) => {
    const rank: Record<string, number> = {
      in_progress: 0,
      pending: 1,
      "hazırlanıyor": 1,
      completed: 2,
    };
    return arr
      .slice()
      .sort((a, b) => {
        const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
        if (r !== 0) return r;
        const at = (a as any).createdAt?.toMillis?.() ?? 0;
        const bt = (b as any).createdAt?.toMillis?.() ?? 0;
        if (at !== bt) return dir === "desc" ? bt - at : at - bt;
        return a.id.localeCompare(b.id);
      });
  };

  /* ================== Email ısındırma ================== */
  const warmEmails = async (list: Purchase[]) => {
    const toFetch = list.filter((p) => !p.userEmail && !emailCacheRef.current.has(p.userId));
    if (toFetch.length === 0) return;
    for (const p of toFetch) {
      try {
        const ud = await getDoc(doc(db, "users", p.userId));
        const mail = ud.exists() ? (ud.data() as any)?.email ?? null : null;
        emailCacheRef.current.set(p.userId, mail);
      } catch {
        emailCacheRef.current.set(p.userId, null);
      }
    }
    // küçük state tetikleyici
    setOrders((prev) => [...prev]);
  };

  /* ================== Dosya seç/yükle ================== */
  const onFileSelect = (pid: string, file: File | null) => {
    setSelectedFiles((s) => ({ ...s, [pid]: file }));
    setUploadPct((s) => ({ ...s, [pid]: 0 }));
    setInputKey((k) => ({ ...k, [pid]: (k[pid] ?? 0) + 1 }));
  };

  // API route'a yükleme — CORS yok
  const uploadPdf = async (p: Purchase) => {
    const file = selectedFiles[p.id];
    if (!file) return alert("Yüklenecek PDF seçilmedi.");
    if (file.type !== "application/pdf") return alert("Lütfen PDF yükleyin.");
    if (file.size > 25 * 1024 * 1024) return alert("PDF 25MB’dan büyük olamaz.");

    const user = auth.currentUser;
    if (!user) return alert("Oturum bulunamadı.");

    setBusyId(p.id);
    setUploadPct((s) => ({ ...s, [p.id]: 10 }));

    try {
      const idToken = await user.getIdToken();

      const apiBase =
        process.env.NEXT_PUBLIC_FUNCTIONS_BASE ??
        "https://europe-west1-dilekce-destek.cloudfunctions.net/api";

      const res = await fetch(`${apiBase}/upload-petition?purchaseId=${encodeURIComponent(p.id)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": file.type || "application/pdf",
          "X-File-Name": `${p.id}.pdf`,
        },
        body: file, // raw
      });

      if (!res.ok) {
        const j = await tryReadJson(res).catch(() => ({} as any));
        throw new Error((j as any)?.error || `Upload failed: ${res.status}`);
      }
      await tryReadJson(res).catch(() => ({}));
      setUploadPct((s) => ({ ...s, [p.id]: 100 }));
      onFileSelect(p.id, null);
      alert("PDF yüklendi. Artık 'Siparişi Tamamla' aktif.");
    } catch (e: any) {
      console.error("[uploadPdf] error:", e);
      alert("PDF yüklenemedi: " + (e?.message || e?.code || String(e)));
    } finally {
      setBusyId(null);
      setUploadPct((s) => ({ ...s, [p.id]: 0 }));
    }
  };

  /* ================== Sipariş tamamlama & mail ================== */
  const completeOrder = async (p: Purchase) => {
    if (!p.deliveredPdfUrl) return alert("Önce PDF yükleyin veya AI’den PDF üretin.");
    if (!auth.currentUser) return alert("Oturum bulunamadı.");

    setBusyId(p.id);
    try {
      await updateDoc(doc(db, "purchases", p.id), {
        status: "completed",
        updatedAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });

      // otomatik mail
      const email = p.userEmail ?? emailCacheRef.current.get(p.userId) ?? null;
      if (email) {
        const apiBase =
          process.env.NEXT_PUBLIC_FUNCTIONS_BASE ??
          "https://europe-west1-dilekce-destek.cloudfunctions.net/api";

        await fetch(`${apiBase}/sendEmail`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: "Dilekçeniz hazır 🎉",
            html: `<p>Merhaba, dilekçeniz hazır. <a href="${p.deliveredPdfUrl}" target="_blank" rel="noopener">PDF’i indir</a>.</p>`,
          }),
        });
      }

      alert("Sipariş tamamlandı.");
    } catch (e: any) {
      console.error("[completeOrder] error:", e);
      alert("Tamamlama başarısız: " + (e?.message || e?.code || String(e)));
    } finally {
      setBusyId(null);
    }
  };

  const resendMail = async (p: Purchase) => {
    const email = p.userEmail ?? emailCacheRef.current.get(p.userId) ?? null;
    if (!email) return alert("E-posta bulunamadı.");
    if (!p.deliveredPdfUrl) return alert("PDF yüklenmemiş.");

    setBusyId(p.id);
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_FUNCTIONS_BASE ??
        "https://europe-west1-dilekce-destek.cloudfunctions.net/api";

      const subject = "Dilekçeniz hazır 🎉";
      const html = `
        <div style="font:14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;">
          <p>Merhaba,</p>
          <p>Dilekçeniz hazır. Aşağıdaki bağlantıdan indirebilirsiniz:</p>
          <p><a href="${p.deliveredPdfUrl}" target="_blank" rel="noopener">PDF’i indir / görüntüle</a></p>
          <hr/>
          <p>Teşekkürler,<br/>Hukuk Destek Ekibi</p>
        </div>
      `;

      const resp = await fetch(`${apiBase}/sendEmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject, html }),
      });

      const j = await tryReadJson(resp).catch(() => ({}));
      if (!resp.ok || !(j as any)?.ok) throw new Error((j as any)?.error || `Mail failed: ${resp.status}`);

      alert("E-posta gönderildi.");
    } catch (e: any) {
      console.error("[resendMail] error:", e);
      alert("E-posta gönderilemedi: " + (e?.message || e?.code || String(e)));
    } finally {
      setBusyId(null);
    }
  };

  /* ================== AI işlemleri (Yeni `ai.ts` ile uyumlu) ================== */

  // “Üstlen”
  const claimAi = async (p: Purchase) => {
    if (!auth.currentUser) return alert("Önce giriş yapın.");
    if (p.assignedLawyerId) return alert("Bu kayıt zaten atanmış.");

    setBusyId(p.id);
    try {
      const pRef = doc(db, "purchases", p.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(pRef);
        if (!snap.exists()) throw new Error("Satın alma bulunamadı.");
        const data: any = snap.data() || {};
        if (data.assignedLawyerId) throw new Error("Bu kayıt az önce başkası tarafından üstlenildi.");
        tx.set(
          pRef,
          {
            assignedLawyerId: auth.currentUser!.uid,
            status: data.status || "in_progress",
            updatedAt: serverTimestamp(),
            meta: { ai: { ...(data?.meta?.ai || {}), claimedAt: serverTimestamp() } },
          },
          { merge: true }
        );
      });
      alert("Sipariş üstlenildi.");
    } catch (e: any) {
      alert(e?.message || "Üstlenme başarısız.");
    } finally {
      setBusyId(null);
    }
  };

// AI’den DOCX/PDF üret (server tarafı, meta.ai.lastHtml → render)
const generateFromAI = async (p: Purchase, format: "docx" | "pdf") => {
  setBusyId(p.id);
  try {
    const AI_BASE = (process.env.NEXT_PUBLIC_AI_BASE || "").replace(/\/+$/, "");
    const FN_BASE = (process.env.NEXT_PUBLIC_FUNCTIONS_BASE || "").replace(/\/+$/, "");

    // En sağlam deneme sırası: doğrudan AI_BASE → functions üzerinden /ai → kök /ai
    const urls = [
      AI_BASE ? `${AI_BASE}/render` : "",
      FN_BASE ? `${FN_BASE}/ai/render` : "",
      `/ai/render`,
    ].filter(Boolean);

    let lastErr: any = null;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseId: p.id, format }),
        });

        const ctype = res.headers.get("content-type") || "";
        if (!ctype.includes("application/json")) {
          const txt = await res.text();
          const firstLine = (txt || "").split("\n")[0]?.slice(0, 160) || "Bilinmeyen hata";
          throw new Error(`Beklenmeyen yanıt: ${firstLine}`);
        }

        const j = await res.json();
        if (!res.ok || j?.error) throw new Error(j?.error || `render ${format} failed`);

        alert(`${format.toUpperCase()} üretildi.`);
        setBusyId(null);
        return;
      } catch (e: any) {
        lastErr = e;
        // sıradaki URL’i dene
      }
    }

    throw lastErr || new Error("Render servisine ulaşılamadı.");
  } catch (e: any) {
    console.error("[generateFromAI] error:", e);
    alert(`AI ${format.toUpperCase()} üretimi başarısız: ` + (e?.message || e?.code || String(e)));
  } finally {
    setBusyId(null);
  }
};


  /* ================== Bölümler ================== */
  const activeList = useMemo(
    () => sortAll(orders.filter((o) => ACTIVE_SET.has(o.status)), sortDir),
    [orders, sortDir]
  );
  const completedList = useMemo(
    () => sortAll(orders.filter((o) => o.status === "completed"), sortDir),
    [orders, sortDir]
  );

  /* ================== UI ================== */
  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Siparişler (Atanmış)</h1>

        {/* Sıralama anahtarı */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Sıralama:</span>
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="rounded-md border px-3 py-1 hover:bg-gray-50"
            title="Yeni → Eski / Eski → Yeni"
          >
            {sortDir === "desc" ? "Yeni → Eski" : "Eski → Yeni"}
          </button>
        </div>
      </div>

      {/* === Bekleyen AI Taslaklar (atanmamış) === */}
      <SectionTitle
        title="Bekleyen AI Taslaklar"
        count={aiQueue.length}
        subtitle='meta.ai.state = "awaiting_review" olup henüz avukata atanmamış siparişler'
      />
      <div className="grid gap-4 mb-6">
        {aiQueue.length === 0 ? (
          <EmptyCard text="Bekleyen AI taslak bulunamadı." />
        ) : (
          aiQueue.map((o) => {
            const mail = o.userEmail ?? emailCacheRef.current.get(o.userId) ?? null;
            return (
              <div key={`aiq-${o.id}`} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <div className="font-medium">
                      {productLabel((o as any).productKey, o.productType)} <StatusBadge status="in_progress" />
                    </div>
                    <div className="text-xs text-gray-600">ID: {o.id}</div>
                    <div className="text-xs text-gray-600">Kullanıcı: {maskEmail(mail)}</div>
                    {o.aiDraftDocxUrl && (
                      <a
                        href={o.aiDraftDocxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-2 text-sm text-sky-600 hover:underline"
                      >
                        Taslak DOCX’i Aç
                      </a>
                    )}
                    {o.aiDraftPdfUrl && (
                      <a
                        href={o.aiDraftPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-sm text-sky-600 hover:underline"
                      >
                        Taslak PDF’i Aç
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => claimAi(o)}
                      disabled={busyId === o.id}
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-800"
                      title="Bu siparişi üstlen"
                    >
                      Üstlen
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* === Aktif Siparişler === */}
      <SectionTitle
        title="Aktif Siparişler"
        count={activeList.length}
        subtitle="Bekleyen ve devam eden siparişler"
      />
      <div className="grid gap-4">
        {activeList.length === 0 && <EmptyCard text="Atanmış aktif sipariş bulunamadı." />}

        {activeList.map((o) => {
          const hasPdf = !!o.deliveredPdfUrl;
          const file = selectedFiles[o.id] ?? null;
          const pct = uploadPct[o.id] ?? 0;
          const isAI = isAIProduct(o.productType);

          return (
            <div key={o.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="font-medium">
                    {productLabel((o as any).productKey, o.productType)} <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-gray-600">ID: {o.id}</div>
                  <div className="text-xs text-gray-600">
                    Kullanıcı: {maskEmail(o.userEmail ?? emailCacheRef.current.get(o.userId) ?? null)}
                  </div>
                  {o.chatId && <div className="text-xs text-gray-600">Sohbet: {o.chatId}</div>}

                  {/* AI ise taslak linkleri göster */}
                  {isAI && (
                    <>
                      {o.aiDraftDocxUrl && (
                        <a
                          href={o.aiDraftDocxUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-2 text-sm text-sky-600 hover:underline"
                        >
                          Taslak DOCX’i Aç
                        </a>
                      )}
                      {o.aiDraftPdfUrl && (
                        <a
                          href={o.aiDraftPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-sm text-sky-600 hover:underline"
                        >
                          Taslak PDF’i Aç
                        </a>
                      )}
                    </>
                  )}
                </div>

                <div className="flex-1">
                  {/* AI aksiyonları (yeni `ai.ts` ile) */}
                  {isAI && (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => generateFromAI(o, "docx")}
                        disabled={busyId === o.id}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                        title="AI taslağından DOCX üret (meta.ai.lastHtml → render)"
                      >
                        AI’den DOCX Üret
                      </button>
                      <button
                        onClick={() => generateFromAI(o, "pdf")}
                        disabled={busyId === o.id}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                        title="AI taslağından PDF üret (puppeteer kurulu olmalı)"
                      >
                        AI’den PDF Üret
                      </button>
                    </div>
                  )}

                  {/* Dosya seçimi / manuel yükleme */}
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      key={inputKey[o.id] ?? 0}
                      id={`file-${o.id}`}
                      type="file"
                      accept="application/pdf"
                      disabled={busyId === o.id}
                      onChange={(e) => onFileSelect(o.id, e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <label
                      htmlFor={`file-${o.id}`}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                        busyId === o.id ? "opacity-50 pointer-events-none" : "hover:bg-gray-50"
                      }`}
                      title={hasPdf ? "Yeni PDF seçerek mevcut dosyayı değiştir" : "PDF seç"}
                    >
                      {hasPdf ? "PDF’yi Değiştir" : "PDF Seç"}
                    </label>

                    {file ? (
                      <>
                        <span className="text-xs text-gray-700">
                          Seçilen: <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
                        </span>
                        <button
                          onClick={() => onFileSelect(o.id, null)}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                          disabled={busyId === o.id}
                          title="Seçimi temizle"
                        >
                          Kaldır
                        </button>
                        <button
                          onClick={() => uploadPdf(o)}
                          disabled={busyId === o.id}
                          className="rounded-md bg-black px-3 py-2 text-white text-sm hover:bg-gray-800"
                          title="PDF’i yükle"
                        >
                          Yükle
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-500">PDF seçin ve “Yükle”ye basın.</span>
                        {hasPdf && (
                          <a
                            href={o.deliveredPdfUrl || "#"}
                            target="_blank"
                            className="text-xs underline"
                          >
                            Yüklü PDF’i aç
                          </a>
                        )}
                      </>
                    )}
                  </div>

                  {/* Basit ilerleme */}
                  {busyId === o.id && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
                      <div
                        className="h-2 rounded bg-black animate-pulse"
                        style={{ width: uploadPct[o.id] ? `${uploadPct[o.id]}%` : "100%" }}
                      />
                    </div>
                  )}

                  {/* İşlemler */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => completeOrder(o)}
                      disabled={busyId === o.id || !hasPdf}
                      className={`rounded-lg px-3 py-2 text-white ${
                        hasPdf ? "bg-black hover:bg-gray-800" : "bg-gray-400 cursor-not-allowed"
                      }`}
                      title={hasPdf ? "Siparişi tamamla" : "Önce PDF yükleyin veya AI’den üretin"}
                    >
                      Siparişi Tamamla
                    </button>

                    {hasPdf && (
                      <button
                        onClick={() => resendMail(o)}
                        disabled={busyId === o.id}
                        className="rounded-lg px-3 py-2 border text-sm hover:bg-gray-50 transition"
                        title="PDF linkini kullanıcıya tekrar e-posta ile gönder"
                      >
                        Yeniden Mail Gönder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* === Tamamlanmış Siparişler === */}
      <SectionTitle
        title="Tamamlanmış Siparişler"
        count={completedList.length}
        subtitle="Yalnızca size atanmış tamamlanmış siparişler"
        className="mt-10"
      />
      <div className="grid gap-4">
        {completedList.length === 0 && <EmptyCard text="Tamamlanmış sipariş bulunamadı." />}

        {completedList.map((o) => {
          const file = selectedFiles[o.id] ?? null;
          const pct = uploadPct[o.id] ?? 0;

          return (
            <div key={o.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="font-medium">
                    {productLabel((o as any).productKey, o.productType)} <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-gray-600">ID: {o.id}</div>
                  <div className="text-xs text-gray-600">
                    Kullanıcı: {maskEmail(o.userEmail ?? emailCacheRef.current.get(o.userId) ?? null)}
                  </div>
                  {o.chatId && <div className="text-xs text-gray-600">Sohbet: {o.chatId}</div>}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Gizli dosya inputu */}
                    <input
                      key={inputKey[o.id] ?? 0}
                      id={`c-file-${o.id}`}
                      type="file"
                      accept="application/pdf"
                      disabled={busyId === o.id}
                      onChange={(e) => onFileSelect(o.id, e.target.files?.[0] ?? null)}
                      className="hidden"
                    />

                    {/* Seçme label’ı */}
                    <label
                      htmlFor={`c-file-${o.id}`}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                        busyId === o.id ? "opacity-50 pointer-events-none" : "hover:bg-gray-50"
                      }`}
                      title={o.deliveredPdfUrl ? "Yeni PDF seçerek mevcut dosyayı değiştir" : "PDF seç"}
                    >
                      {selectedFiles[o.id]
                        ? "Farklı PDF Seç"
                        : o.deliveredPdfUrl
                        ? "PDF’yi Değiştir"
                        : "PDF Seç"}
                    </label>

                    {/* Seçim yapıldıysa Yükle/Kaldır; değilse PDF’i Aç + Mail */}
                    {selectedFiles[o.id] ? (
                      <>
                        <span className="text-xs text-gray-700">
                          Seçilen: <b>{selectedFiles[o.id]!.name}</b> (
                          {Math.round((selectedFiles[o.id]!.size || 0) / 1024)} KB)
                        </span>
                        <button
                          onClick={() => onFileSelect(o.id, null)}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                          disabled={busyId === o.id}
                          title="Seçimi temizle"
                        >
                          Kaldır
                        </button>
                        <button
                          onClick={() => uploadPdf(o)}
                          disabled={busyId === o.id}
                          className="rounded-md bg-black px-3 py-2 text-white text-sm hover:bg-gray-800"
                          title="Yeni PDF’i yükle (mevcudun üzerine yazar)"
                        >
                          Yükle
                        </button>
                      </>
                    ) : o.deliveredPdfUrl ? (
                      <>
                        <a
                          href={o.deliveredPdfUrl}
                          target="_blank"
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                          title="PDF’i aç"
                        >
                          PDF’i Aç
                        </a>
                        <button
                          onClick={() => resendMail(o)}
                          className="rounded-lg px-3 py-2 border text-sm hover:bg-gray-50 transition"
                          title="PDF linkini kullanıcıya tekrar e-posta ile gönder"
                        >
                          Yeniden Mail Gönder
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">PDF bulunamadı.</span>
                    )}
                  </div>

                  {/* Yükleme ilerleme çubuğu */}
                  {busyId === o.id && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
                      <div
                        className="h-2 rounded bg-black animate-pulse"
                        style={{ width: pct ? `${pct}%` : "100%" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {orders.length === 0 && aiQueue.length === 0 && (
        <div className="mt-6 rounded-lg border p-6 text-center text-gray-600">
          Size atanmış veya bekleyen sipariş bulunamadı.
        </div>
      )}
    </div>
  );
}

/* ================== Küçük UI yardımcıları ================== */

function SectionTitle({
  title,
  count,
  subtitle,
  className = "",
}: {
  title: string;
  count: number;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center gap-2 ${className}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{count}</span>
      {subtitle && <span className="text-xs text-gray-500">• {subtitle}</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Bekliyor", cls: "bg-yellow-100 text-yellow-800" },
    in_progress: { label: "Devam Ediyor", cls: "bg-blue-100 text-blue-800" },
    completed: { label: "Tamamlandı", cls: "bg-green-100 text-green-800" },
    "hazırlanıyor": { label: "Hazırlanıyor", cls: "bg-yellow-50 text-yellow-700" },
  };
  const v = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return <span className={`ml-2 rounded px-2 py-0.5 text-xs ${v.cls}`}>{v.label}</span>;
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-lg border p-4 text-sm text-gray-500">{text}</div>;
}

function maskEmail(email?: string | null) {
  if (!email) return "bilinmiyor";
  const [local, domain = ""] = email.split("@");
  const ml =
    local.length <= 2 ? local[0] + "*" : local.slice(0, 2) + "*".repeat(Math.max(1, local.length - 2));
  const [dom, tld = ""] = domain.split(".");
  const md = dom.length <= 1 ? dom + "*" : dom.slice(0, 1) + "*".repeat(Math.max(1, dom.length - 1));
  return `${ml}@${md}${tld ? "." + tld : ""}`;
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
    case "dilekçe":
      return "Yapay Zekâ ile Dilekçe Yazımı";
    case "gorusme":
    case "uzman-gorusmesi":
      return "Uzmanla Görüşme";
    default:
      return type || key || "Ürün";
  }
}

/* ================== Küçük yardımcı: güvenli JSON okuyucu ================== */
async function tryReadJson(res: Response): Promise<any> {
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    // JSON değilse text olarak dön
    const txt = await res.text();
    return { ok: false, error: (txt || "").slice(0, 200) };
  }
  return res.json();
}
