// src/components/ChatBox.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaTimes, FaPaperPlane, FaPaperclip, FaUserTie, FaUserCircle } from "react-icons/fa";

import { auth, dbRealtime, dbFirestore } from "../firebase/config";

// RTDB (anlık)
import {
  ref as rRef,
  get,
  onChildAdded,
  push,
  set,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";

// Firestore (kalıcı)
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp as fsServerTimestamp,
  Timestamp,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

type Author = "client" | "lawyer" | "system";

interface ChatMessage {
  id: string;
  author: Author;
  authorId?: string;
  text: string;
  ts: number;              // epoch ms
  clientMsgId?: string;    // dedup
}

interface ChatBoxProps {
  onClose: () => void;
  expertName?: string;
  expertOnline?: boolean;

  // Sohbet bağlamı
  purchaseId: string;      // sohbet id’si (satın alım)
  userId: string;          // sohbet sahibi (müşteri) UID
}

const genClientMsgId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const fmtTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function ChatBox({
  onClose,
  expertName = "Uzman",
  expertOnline = true,
  purchaseId,
  userId,
}: ChatBoxProps) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);

  // ticket state
  const [ticketReady, setTicketReady] = useState(false);

  const seen = useRef<Set<string>>(new Set()); // clientMsgId dedup
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ranEnsureRef = useRef(false); // React 18 double-effect guard

  // --- 1) Ticket’ı hem RTDB hem Firestore’da garanti et ---
  const ensureTicketOnce = async () => {
    const me = auth.currentUser;
    if (!purchaseId || !me) return false;

    const uid = me.uid;
    const isClient = uid === userId;

    try {
      // --- RTDB ---
      const tRef = rRef(dbRealtime, `chatTickets/${purchaseId}`);
      const tSnap = await get(tRef);
      let rtdbOk = false;

      if (!tSnap.exists()) {
        if (!isClient) {
          console.warn("[CHAT] ticket yok ve current user uzman; RTDB’de oluşturmayacağız.");
          // Uzman oluşturmuyor ama yoksa bile FS/RTDB mirror denemelerine devam etmeye gerek yok.
        } else {
          try {
            await set(tRef, {
              userId: userId || uid,
              assignedLawyer: null,
              purchaseId,
              status: "open",
              createdAt: rtdbServerTimestamp(),
              updatedAt: rtdbServerTimestamp(),
            });
            console.log("[CHAT] RTDB ticket set OK");
            rtdbOk = true;
          } catch (e) {
            console.error("[CHAT] RTDB set FAIL:", e);
          }
        }
      } else {
        rtdbOk = true; // RTDB’de zaten var ⇒ sohbet başlayabilir
      }

      // --- Firestore mirror (best-effort, başarısızsa sohbeti bloklama) ---
      try {
        const fsRef = doc(dbFirestore, "chatTickets", purchaseId);
        const fsSnap = await getDoc(fsRef);
        if (!fsSnap.exists()) {
          if (isClient) {
            await setDoc(
              fsRef,
              {
                userId: userId || uid,
                assignedLawyer: null,
                status: "open",
                createdAt: fsServerTimestamp(),
                updatedAt: fsServerTimestamp(),
              },
              { merge: true }
            );
            console.log("[CHAT] FS mirror set OK");
          } else {
            console.warn("[CHAT] FS mirror yok; uzman kullanıcı oluşturmayacak (normal).");
          }
        } else {
          await setDoc(fsRef, { updatedAt: fsServerTimestamp() }, { merge: true });
          console.log("[CHAT] FS mirror update OK");
        }
      } catch (e) {
        console.error("[CHAT] FS mirror (best-effort) error:", e);
        // burada return false YAPMIYORUZ — RTDB varsa sohbet devam eder
      }

      return rtdbOk;
    } catch (err) {
      console.error("[CHAT] ensureTicketOnce fatal:", err);
      // fatal durumda da engelleme — en kötü RTDB listener’ı yine çalışır
      return false;
    }
  };

  // İlk açılışta ticket’ı garanti et
  useEffect(() => {
    let cancelled = false;
    if (ranEnsureRef.current) return;
    ranEnsureRef.current = true;

    (async () => {
      const ok = await ensureTicketOnce();
      if (!cancelled) setTicketReady(ok); // RTDB var ise true
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  // Hoş geldin mesajı
  useEffect(() => {
    setMessages([
      {
        id: "system-welcome",
        author: "system",
        text: "Merhaba! Mesajınızı yazın; uzman bağlantısı sağlandığında buradan devam edeceksiniz.",
        ts: Date.now(),
      },
    ]);
  }, []);

  // --- 2) Firestore: geçmiş + canlı dinleme ---
  useEffect(() => {
    if (!purchaseId) return;

    try {
      const qRef = query(
        collection(dbFirestore, "chatRooms", purchaseId, "messages"),
        orderBy("createdAt", "asc")
      );

      const unsub = onSnapshot(
        qRef,
        (snap) => {
          const next: ChatMessage[] = [];
          snap.forEach((d) => {
            const data: any = d.data();

            const rawRole: string =
              (data.author ?? data.authorRole ??
                (data.senderId === auth.currentUser?.uid ? "client" : "lawyer")) as string;
            const role: Author = (rawRole === "user" ? "client" : rawRole) as Author;

            const ts =
              (data.createdAt instanceof Timestamp && data.createdAt.toMillis()) ||
              (typeof data.createdAt === "number" ? Number(data.createdAt) : Date.now());

            const clientMsgId: string = data.clientMsgId || d.id;

            next.push({
              id: clientMsgId,
              clientMsgId,
              author: role,
              authorId: data.authorId ?? data.senderId,
              text: String(data.text ?? ""),
              ts,
            });
          });

          for (const m of next) seen.current.add(m.id);
          setMessages((prev) => {
            const sys = prev.find((m) => m.author === "system");
            const notOverridden = prev.filter((p) => !seen.current.has(p.id) && p.author !== "system");
            const merged = [...(sys ? [sys] : []), ...notOverridden, ...next].sort((a, b) => a.ts - b.ts);
            return merged;
          });
        },
        (err) => {
          console.error("[CHAT] Firestore snapshot error:", err);
          if ((err as any)?.code === "permission-denied") {
            setMessages((prev) => [
              ...prev,
              {
                id: "system-perm",
                author: "system",
                text: "⚠️ Mesaj geçmişine erişim izni yok. Firestore rules’u geçici olarak genişletin.",
                ts: Date.now(),
              },
            ]);
          }
        }
      );

      return () => unsub();
    } catch (err) {
      console.error("[CHAT] Firestore listener init error:", err);
    }
  }, [purchaseId]);

  // --- 3) RTDB: anlık ayna (latency için) ---
  useEffect(() => {
    if (!purchaseId) return;

    try {
      const listRef = rRef(dbRealtime, `chatRooms/${purchaseId}/messages`);
      const unsub = onChildAdded(
        listRef,
        (snap) => {
          const v = snap.val();
          if (!v) return;

          const clientMsgId: string = v.clientMsgId || snap.key || Math.random().toString(36).slice(2);
          if (seen.current.has(clientMsgId)) return; // Firestore ile çakışma engeli

          const rawRole: string =
            (v.author ?? v.authorRole ??
              (v.senderId === auth.currentUser?.uid ? "client" : "lawyer")) as string;
          const role: Author = (rawRole === "user" ? "client" : rawRole) as Author;

          const ts = typeof v.ts === "number" ? v.ts : Date.now();

          const item: ChatMessage = {
            id: clientMsgId,
            clientMsgId,
            author: role,
            authorId: v.authorId ?? v.senderId,
            text: String(v.text ?? ""),
            ts,
          };

          seen.current.add(clientMsgId);
          setMessages((prev) => [...prev, item].sort((a, b) => a.ts - b.ts));
        },
        (err) => {
          const msg = String(err?.message || err).toLowerCase();
          if (msg.includes("permission_denied") || msg.includes("permission denied")) {
            return; // ilk saniyelerde olabilir; susturalım
          }
          console.warn("[CHAT] RTDB onChildAdded error:", err);
        }
      );

      return () => unsub();
    } catch (err) {
      console.warn("[CHAT] RTDB listener init error:", err);
    }
  }, [purchaseId]);

  // --- 4) Mesaj gönder (Firestore + RTDB mirror) ---
  const send = async () => {
    const txt = message.trim();
    if (!txt || !purchaseId || sending) return;

    const me = auth.currentUser;
    if (!me) {
      alert("Mesaj göndermek için lütfen giriş yapın.");
      return;
    }

    setSending(true);
    try {
      // RTDB ticket’ı garanti et (best-effort); başarısız olsa da mesajı denemeye devam
      const ok = ticketReady ? true : await ensureTicketOnce();
      if (ok && !ticketReady) setTicketReady(true);

      const uid = me.uid;
      const email = me.email || "";
      const role: Author = uid === userId ? "client" : "lawyer";
      const clientMsgId = genClientMsgId();

      // Firestore (kalıcı, best-effort)
      try {
        await addDoc(collection(dbFirestore, "chatRooms", purchaseId, "messages"), {
          text: txt,
          author: role,
          authorRole: role,
          authorId: uid,
          authorEmail: email,
          authorEmailLower: email.toLowerCase(),
          clientMsgId,
          createdAt: fsServerTimestamp(),
        });
      } catch (e: any) {
        console.error("[CHAT][send] firestore write error:", e);
        if (e?.code === "permission-denied") {
          setMessages((prev) => [
            ...prev,
            {
              id: clientMsgId + "_perm",
              clientMsgId: clientMsgId + "_perm",
              author: "system",
              text: "⚠️ Mesaj Firestore’a kaydedilemedi (rules). RTDB’ye gönderildi.",
              ts: Date.now(),
            },
          ]);
        }
      }

      // RTDB (anlık ayna — her koşulda)
      try {
        await set(push(rRef(dbRealtime, `chatRooms/${purchaseId}/messages`)), {
          text: txt,
          author: role,
          authorRole: role,
          authorId: uid,
          authorEmail: email,
          authorEmailLower: email.toLowerCase(),
          clientMsgId,
          ts: Date.now(),
        });
      } catch (e) {
        console.warn("[CHAT][send] rtdb mirror error:", e);
      }

      // küçük typing simülasyonu
      setTyping(true);
      setTimeout(() => setTyping(false), 900);

      setMessage("");
    } catch (err: any) {
      console.error("[CHAT][send] error:", err?.code || err, err);
      alert("Mesaj gönderilemedi. Konsolu kontrol edin.");
    } finally {
      setSending(false);
    }
  };

  // UI: scroll & focus
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Stil (taşma/uzama fix) ----
  const S = useMemo(() => {
    const radius = 14;
    return {
      container: {
        position: "fixed" as const,
        bottom: 96,
        right: 24,
        width: 380,
        maxWidth: "min(92vw, 420px)",
        height: 560,
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        boxShadow: "0 16px 40px rgba(0,0,0,.18)",
        zIndex: 1001,
        display: "flex",
        flexDirection: "column" as const,
        overflow: "hidden",
        boxSizing: "border-box" as const,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      },
      header: {
        background: "linear-gradient(90deg,#0D6EFD,#2563EB)",
        color: "#fff",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      },
      expertWrap: { display: "flex", alignItems: "center", gap: 10 },
      avatar: {
        width: 32,
        height: 32,
        borderRadius: 999,
        background: "rgba(255,255,255,.25)",
        display: "grid",
        placeItems: "center",
      },
      badge: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600 },
      dot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        background: expertOnline ? "#34D399" : "#9CA3AF",
        boxShadow: expertOnline ? "0 0 0 2px rgba(52,211,153,.25)" : "none",
      },

      body: {
        flex: 1,
        padding: "12px 14px 18px",
        paddingRight: 14,
        overflowY: "auto" as const,
        background: "#F8FAFC",
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
        scrollbarWidth: "thin" as const,
      },

      rowUser:   { alignSelf: "stretch", display: "flex", justifyContent: "flex-end",  padding: "0 2px" },
      rowExpert: { alignSelf: "stretch", display: "flex", justifyContent: "flex-start", padding: "0 2px" },

      bubbleBase: {
        boxSizing: "border-box" as const,
        display: "inline-flex",
        flexDirection: "column" as const,
        gap: 6,
        padding: "10px 12px",
        borderRadius: radius,
        width: "fit-content",
        maxWidth: "78%",
        minWidth: 36,
        lineHeight: 1.35,
        fontSize: 14,
        whiteSpace: "pre-wrap" as const,
        overflowWrap: "anywhere" as const,
        wordBreak: "break-word" as const,
      },
      bubbleUser:   { background: "#DCEAFE", border: "1px solid #BFDBFE", color: "#111827" },
      bubbleExpert: { background: "#FFFFFF", border: "1px solid #E5E7EB",  color: "#111827" },

      metaLeft:  { fontSize: 11, color: "#6B7280", marginTop: 4, textAlign: "left"  as const },
      metaRight: { fontSize: 11, color: "#6B7280", marginTop: 4, textAlign: "right" as const },

      typing: {
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: radius,
        padding: "8px 10px",
      },

      footer: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderTop: "1px solid #E5E7EB",
        background: "#FFFFFF",
      },
      iconBtn: { background: "transparent", border: "none", cursor: "pointer", padding: 8, borderRadius: 8 },
      input: {
        flex: 1,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #E5E7EB",
        outline: "none",
        fontSize: 14,
      },
      sendBtn: {
        background: "#0D6EFD",
        color: "#fff",
        border: "none",
        borderRadius: 12,
        padding: "10px 12px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "filter .12s ease",
        opacity: sending ? 0.7 : 1,
      },
    };
  }, [expertOnline, sending]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={S.container} role="dialog" aria-label="Destek Sohbeti" aria-modal>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,.25)",
            display: "grid", placeItems: "center"
          }}>
            {expertOnline ? <FaUserTie color="#fff" size={16} /> : <FaUserCircle color="#fff" size={16} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <span>{expertName}</span>
            <span style={{
              width: 8, height: 8, borderRadius: 999,
              background: expertOnline ? "#34D399" : "#9CA3AF",
              boxShadow: expertOnline ? "0 0 0 2px rgba(52,211,153,.25)" : "none",
            }} />
            <span style={{ fontWeight: 500, opacity: 0.9 }}>{expertOnline ? "Çevrimiçi" : "Çevrimdışı"}</span>
          </div>
        </div>
        <FaTimes style={{ marginLeft: "auto", cursor: "pointer", opacity: 0.9 }} onClick={onClose} title="Kapat" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={S.body}>
        {messages.map((m) => {
          const isMine = m.authorId ? m.authorId === auth.currentUser?.uid : m.author === "client";
          const rowStyle = isMine ? S.rowUser : S.rowExpert;
          const bubbleStyle: React.CSSProperties = {
            ...(S.bubbleBase as React.CSSProperties),
            ...(isMine ? (S.bubbleUser as React.CSSProperties) : (S.bubbleExpert as React.CSSProperties)),
          };
          return (
            <div key={m.id} style={rowStyle}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start" }}>
                <div style={bubbleStyle}>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {m.text}
                  </div>
                </div>
                <div style={isMine ? (S.metaRight as React.CSSProperties) : (S.metaLeft as React.CSSProperties)}>
                  {fmtTime(m.ts)}
                </div>
              </div>
            </div>
          );
        })}

        {typing && (
          <div style={S.typing as React.CSSProperties}>
            <div style={{ display: "inline-flex", gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#9CA3AF", animation: "blink 1s infinite .0s" }} />
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#9CA3AF", animation: "blink 1s infinite .15s" }} />
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#9CA3AF", animation: "blink 1s infinite .3s" }} />
            </div>
            <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 6 }}>yazıyor…</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={S.footer}>
        <button
          type="button"
          title="Dosya ekle (yakında)"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, borderRadius: 8 }}
          onClick={() => alert("Dosya gönderme yakında.")}
        >
          <FaPaperclip size={18} color="#6B7280" />
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder="Mesajınızı yazın…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #E5E7EB", outline: "none", fontSize: 14 }}
          disabled={sending}
        />
        <button
          onClick={send}
          style={{ background: "#0D6EFD", color: "#fff", border: "none", borderRadius: 12, padding: "10px 12px", fontWeight: 600, cursor: "pointer", transition: "filter .12s ease", opacity: sending ? 0.7 : 1 }}
          disabled={sending || !message.trim()}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <FaPaperPlane size={14} /> Gönder
          </span>
        </button>
      </div>

      <style jsx>{`
        @keyframes blink { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
        @media (max-width: 520px) {
          div[role="dialog"] { bottom: 84px !important; right: 12px !important; width: calc(100vw - 24px) !important; height: 60vh !important; }
        }
        div[role="dialog"] ::-webkit-scrollbar { width: 8px; }
        div[role="dialog"] ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 8px; }
        div[role="dialog"] ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
}
