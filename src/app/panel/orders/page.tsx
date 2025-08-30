// app/panel/orders/page.tsx
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
  DocumentData,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { dbFirestore as db, auth } from "../../../firebase/config";

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
};

// 🔁 "hazırlanıyor" eklendi
const ACTIVE_SET = new Set(["pending", "in_progress", "hazırlanıyor"]);

export default function OrdersPage() {
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // upload UI state
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [inputKey, setInputKey] = useState<Record<string, number>>({});
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({}); // görsel amaçlı

  // email cache
  const emailCacheRef = useRef<Map<string, string | null>>(new Map());

  // internal: purchases + chatTickets merge
  const mergedMapRef = useRef<Map<string, Purchase>>(new Map());
  const ticketPurchaseUnsubsRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    let stopAuth = () => {};
    let unsubPurchasesActive = () => {};
    let unsubPurchasesCompleted = () => {};
    let unsubTickets = () => {};

    stopAuth = onAuthStateChanged(auth, (u) => {
      // reset
      for (const unsub of ticketPurchaseUnsubsRef.current.values()) unsub();
      ticketPurchaseUnsubsRef.current.clear();
      mergedMapRef.current.clear();
      setOrders([]);

      if (!u) return;

      // 1) Aktif siparişler: assignedLawyerId==uid ve status in (pending, in_progress, hazırlanıyor)
      const qActive = query(
        collection(db, "purchases"),
        where("assignedLawyerId", "==", u.uid),
        where("status", "in", ["pending", "in_progress", "hazırlanıyor"]) // 🔁 eklendi
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
              productType: data.productType ?? "",
              status: data.status ?? "",
              assignedLawyerId: data.assignedLawyerId ?? null,
              deliveredPdfUrl: data.deliveredPdfUrl ?? null,
              userEmail: data.userEmail ?? null,
              createdAt: data.createdAt ?? null,
              chatId: data.chatId ?? null,
            };
            map.set(p.id, p);
          });
          setOrders(sortAll(Array.from(map.values())));
          warmEmails(Array.from(mergedMapRef.current.values()));
        },
        (err) => console.error("[orders] purchases active query error:", err)
      );

      // 2) Tamamlanmış siparişler: assignedLawyerId==uid ve status == completed
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
              productType: data.productType ?? "",
              status: data.status ?? "",
              assignedLawyerId: data.assignedLawyerId ?? null,
              deliveredPdfUrl: data.deliveredPdfUrl ?? null,
              userEmail: data.userEmail ?? null,
              createdAt: data.createdAt ?? null,
              chatId: data.chatId ?? null,
            };
            map.set(p.id, p);
          });
          setOrders(sortAll(Array.from(map.values())));
          warmEmails(Array.from(mergedMapRef.current.values()));
        },
        (err) => console.error("[orders] purchases completed query error:", err)
      );

      // 3) chatTickets fallback — gerekirse aç
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

                  // completed olanları da koruyoruz
                  const p: Purchase = {
                    id: pd.id,
                    userId: data.userId,
                    productType: data.productType ?? "",
                    status: data.status ?? "",
                    assignedLawyerId: data.assignedLawyerId ?? null,
                    deliveredPdfUrl: data.deliveredPdfUrl ?? null,
                    userEmail: data.userEmail ?? null,
                    createdAt: data.createdAt ?? null,
                    chatId: data.chatId ?? null,
                  };
                  mergedMapRef.current.set(pid, p);
                  setOrders(sortAll(Array.from(mergedMapRef.current.values())));
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
    });

    return () => {
      unsubPurchasesActive();
      unsubPurchasesCompleted();
      unsubTickets();
      for (const unsub of ticketPurchaseUnsubsRef.current.values()) unsub();
      ticketPurchaseUnsubsRef.current.clear();
      stopAuth();
    };
  }, []);

  // Tüm siparişlerde sıralama (önce aktifler, sonra createdAt ile)
  const sortAll = (arr: Purchase[]) => {
    // 🔁 "hazırlanıyor" pending ile aynı öncelikte
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
        if (at !== bt) return bt - at; // yeni üstte
        return a.id.localeCompare(b.id);
      });
  };

  const warmEmails = async (list: Purchase[]) => {
    const toFetch = list.filter((p) => !p.userEmail && !emailCacheRef.current.has(p.userId));
    if (toFetch.length === 0) return;
    for (const p of toFetch) {
      try {
        const ud = await getDoc(doc(db, "users", p.userId));
        const mail = ud.exists() ? (ud.data() as any)?.email ?? null : null;
        emailCacheRef.current.set(p.userId, mail);
        setOrders((prev) => [...prev]);
      } catch {
        emailCacheRef.current.set(p.userId, null);
      }
    }
  };

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
      const fd = new FormData();
      fd.append("purchaseId", p.id);
      fd.append("file", file, `${p.id}.pdf`);

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
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.error || `Upload failed: ${res.status}`);
      }
      await res.json();
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

const completeOrder = async (p: Purchase) => {
  if (!p.deliveredPdfUrl) return alert("Önce PDF yükleyin.");
  if (!auth.currentUser) return alert("Oturum bulunamadı.");

  setBusyId(p.id);
  try {
    await updateDoc(doc(db, "purchases", p.id), {
      status: "completed",
      updatedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });

    // ✔ otomatik mail
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
          html: `<p>Merhaba, dilekçeniz hazır. <a href="${p.deliveredPdfUrl}" target="_blank">PDF’i indir</a>.</p>`,
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
        <p><a href="${p.deliveredPdfUrl}" target="_blank">PDF’i indir / görüntüle</a></p>
        <hr/>
        <p>Teşekkürler,<br/>Hukuk Destek Ekibi</p>
      </div>
    `;

    const resp = await fetch(`${apiBase}/sendEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject,
        html,
        // isterseniz attachment olarak da ekleyebilirsiniz:
        // attachments: [{ filename: `${p.id}.pdf`, url: p.deliveredPdfUrl }]
      }),
    });

    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || !j?.ok) throw new Error(j?.error || `Mail failed: ${resp.status}`);

    alert("E-posta gönderildi.");
  } catch (e: any) {
    console.error("[resendMail] error:", e);
    alert("E-posta gönderilemedi: " + (e?.message || e?.code || String(e)));
  } finally {
    setBusyId(null);
  }
};


  // Bölümler
  const activeList = useMemo(() => orders.filter((o) => ACTIVE_SET.has(o.status)), [orders]);
  const completedList = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Siparişler (Atanmış)</h1>

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

          return (
            <div key={o.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="font-medium">
                    { productLabel((o as any).productKey, o.productType) }
 <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-gray-600">ID: {o.id}</div>
                  <div className="text-xs text-gray-600">
                    Kullanıcı: {maskEmail(o.userEmail ?? emailCacheRef.current.get(o.userId) ?? null)}
                  </div>
                  {o.chatId && <div className="text-xs text-gray-600">Sohbet: {o.chatId}</div>}
                </div>

                <div className="flex-1">
                  {/* Dosya seçimi */}
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
                        style={{ width: pct ? `${pct}%` : "100%" }}
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
                      title={hasPdf ? "Siparişi tamamla" : "Önce PDF yükleyin"}
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
                    { productLabel((o as any).productKey, o.productType) }
 <StatusBadge status={o.status} />
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

                    {/* Seçme label’ı (PDF varsa “PDF’yi Değiştir” olarak göster) */}
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

                    {/* Seçim yapıldıysa Yükle/Kaldır; değilse PDF’i Aç + Yeniden Mail Gönder */}
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

                  {/* Yükleme ilerleme çubuğu (tamamlanmışta da gösterebiliriz) */}
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

      {orders.length === 0 && (
        <div className="mt-6 rounded-lg border p-6 text-center text-gray-600">
          Size atanmış sipariş bulunamadı.
        </div>
      )}
    </div>
  );
}

/* ============ Küçük UI yardımcıları ============ */

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
    "hazırlanıyor": { label: "Hazırlanıyor", cls: "bg-yellow-50 text-yellow-700" }, // 🔁 eklendi
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
      return "Yapay Zekâ ile Dilekçe Yazımı";
    case "gorusme":
    case "uzman-gorusmesi":
      return "Uzmanla Görüşme";
    default:
      // Sunucu farklı bir değer yazmışsa en azından tipi gösterelim
      return type || key || "Ürün";
  }
}
