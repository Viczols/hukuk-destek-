// src/components/ChatBox.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaTimes, FaPaperPlane, FaUserTie, FaUserCircle } from "react-icons/fa";

// <-- senin mevcut importların neyse aynı kalsın -->
// import { auth, dbRealtime, dbFirestore } from "../firebase/config";
import {
  ref as rRef,
  get,
  onChildAdded,
  push,
  set,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";
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
import { auth, dbRealtime, dbFirestore } from "../firebase/config";

type Author = "client" | "lawyer" | "system";
interface ChatMessage {
  id: string;
  author: Author;
  authorId?: string;
  text: string;
  ts: number;
  clientMsgId?: string;
}
interface ChatBoxProps {
  onClose: () => void;
  expertName?: string;
  expertOnline?: boolean;
  purchaseId: string;
  userId: string;
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
  const [ticketReady, setTicketReady] = useState(false);

  const seen = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ranEnsureRef = useRef(false);

  // ---- ticket ensure (değiştirmedim) ----
  const ensureTicketOnce = async () => {
    const me = auth.currentUser;
    if (!purchaseId || !me) return false;

    const uid = me.uid;
    const isClient = uid === userId;

    try {
      const tRef = rRef(dbRealtime, `chatTickets/${purchaseId}`);
      const tSnap = await get(tRef);
      let rtdbOk = false;

      if (!tSnap.exists()) {
        if (isClient) {
          await set(tRef, {
            userId: userId || uid,
            assignedLawyer: null,
            purchaseId,
            status: "open",
            createdAt: rtdbServerTimestamp(),
            updatedAt: rtdbServerTimestamp(),
          });
          rtdbOk = true;
        }
      } else {
        rtdbOk = true;
      }

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
          }
        } else {
          await setDoc(fsRef, { updatedAt: fsServerTimestamp() }, { merge: true });
        }
      } catch {}

      return rtdbOk;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (ranEnsureRef.current) return;
    ranEnsureRef.current = true;
    (async () => {
      const ok = await ensureTicketOnce();
      if (!cancelled) setTicketReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [purchaseId]);

  // sistem mesajı
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

  // Firestore dinleyici
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
        () => {}
      );
      return () => unsub();
    } catch {}
  }, [purchaseId]);

  // RTDB dinleyici
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
          if (seen.current.has(clientMsgId)) return;

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
        () => {}
      );
      return () => unsub();
    } catch {}
  }, [purchaseId]);

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
      const ok = ticketReady ? true : await ensureTicketOnce();
      if (ok && !ticketReady) setTicketReady(true);

      const uid = me.uid;
      const email = me.email || "";
      const role: Author = uid === userId ? "client" : "lawyer";
      const clientMsgId = genClientMsgId();

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
      } catch {}

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
      } catch {}

      setTyping(true);
      setTimeout(() => setTyping(false), 900);
      setMessage("");
    } catch (err) {
      console.error("[CHAT][send] error:", err);
      alert("Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ==== THEME: METALİK SİYAH / BEYAZ BUBBLE ====
  const S = useMemo(() => {
    const radius = 16;
    return {
      container: {
        position: "fixed" as const,
        bottom: 96,
        right: 24,
        width: 380,
        maxWidth: "min(92vw, 420px)",
        height: 560,
        background: "linear-gradient(180deg,#0a0b0f,#0b0c11)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        boxShadow: "0 18px 55px rgba(0,0,0,.45)",
        zIndex: 1001,
        display: "flex",
        flexDirection: "column" as const,
        overflow: "hidden",
        boxSizing: "border-box" as const,
        color: "#e5e7eb",
        backdropFilter: "blur(8px)",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      },
      header: {
        // metalik siyah başlık
        background: "linear-gradient(180deg,#12141b,#0e1017)",
        color: "#fff",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      },
body: {
      flex: 1,
      padding: "14px 16px 20px",
      overflowY: "auto" as const,

      // 🔹 Daha modern ve hafif "glassy dark" arkaplan
      backgroundColor: "#10141b",
      backgroundImage: [
        // sağ üstten çok hafif parıltı
        "radial-gradient(1200px 600px at 85% -10%, rgba(255,255,255,0.06), transparent 60%)",
        // sol alttan yumuşak parıltı
        "radial-gradient(800px 400px at -10% 110%, rgba(255,255,255,0.05), transparent 60%)",
        // alttan üste doğru hafif ton farkı
        "linear-gradient(180deg, #10141b 0%, #151a24 100%)"
      ].join(", "),
      // hafif iç gölge: içerik panelini çerçeveler
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 40px rgba(0,0,0,0.25)",

      display: "flex",
      flexDirection: "column" as const,
      gap: 12,
      scrollbarWidth: "thin" as const,
    },

      rowUser: {
        alignSelf: "stretch",
        display: "flex",
        justifyContent: "flex-end",
        padding: "0 2px",
      },
      rowExpert: {
        alignSelf: "stretch",
        display: "flex",
        justifyContent: "flex-start",
        padding: "0 2px",
      },

      bubbleBase: {
        boxSizing: "border-box" as const,
        display: "inline-flex",
        flexDirection: "column" as const,
        gap: 6,
        padding: "12px 14px",
        borderRadius: radius,
        width: "fit-content",
        maxWidth: "82%",
        minWidth: 64, // min genişlik ↑ (tek harfler dikey olmasın)
        lineHeight: 1.4,
        fontSize: 14,
        // --- kırılma ayarları (dikey parçalanmayı önle) ---
        whiteSpace: "pre-wrap" as const,
        overflowWrap: "break-word" as const,
        wordBreak: "break-word" as const,
      },
      bubbleUser: {
        background: "rgba(160, 167, 236, 0.8)", // açık mavi (lightblue) yarı saydam
        border: "1px solid rgba(0,0,0,0.08)",
        color: "#0f1115",
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
      },
      bubbleExpert: {
        background: "rgba(245, 245, 245, 0.9)", // açık gri
        border: "1px solid rgba(0,0,0,0.08)",
        color: "#0f1115",
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
      },

      metaLeft: { fontSize: 11, color: "#9ca3af", marginTop: 4, textAlign: "left" as const },
      metaRight: { fontSize: 11, color: "#9ca3af", marginTop: 4, textAlign: "right" as const },

      typing: {
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#ffffff",
        color: "#0f1115",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: radius,
        padding: "8px 10px",
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
      },

      footer: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg,#0c0e14,#0a0b10)",
        backdropFilter: "blur(6px)",
      },
      input: {
        flex: 1,
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        outline: "none",
        fontSize: 14,
      },
      sendBtn: {
        // TERSİ: artık koyu buton + beyaz yazı
        background: "linear-gradient(180deg,#0f1117,#0b0c12)",
        color: "#ffffff",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 12,
        padding: "12px 14px",
        fontWeight: 700,
        cursor: "pointer",
        transition: "transform .12s ease, filter .12s ease",
        opacity: sending ? 0.85 : 1,
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
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "rgba(255,255,255,.25)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {expertOnline ? <FaUserTie color="#fff" size={16} /> : <FaUserCircle color="#fff" size={16} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <span>{expertName}</span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: expertOnline ? "#34D399" : "#9CA3AF",
                boxShadow: expertOnline ? "0 0 0 2px rgba(52,211,153,.25)" : "none",
              }}
            />
            <span style={{ fontWeight: 500, opacity: 0.9 }}>
              {expertOnline ? "Çevrimiçi" : "Çevrimdışı"}
            </span>
          </div>
        </div>
        <FaTimes
          style={{ marginLeft: "auto", cursor: "pointer", opacity: 0.95 }}
          onClick={onClose}
          title="Kapat"
        />
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
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
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
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0f1115", opacity: .6, animation: "blink 1s infinite .0s" }} />
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0f1115", opacity: .6, animation: "blink 1s infinite .15s" }} />
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0f1115", opacity: .6, animation: "blink 1s infinite .3s" }} />
            </div>
            <span style={{ fontSize: 12, color: "#0f1115", opacity: .75, marginLeft: 6 }}>yazıyor…</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={S.footer}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Mesajınızı yazın..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={onKeyDown}
          style={S.input as React.CSSProperties}
          disabled={sending}
        />
        <button
          onClick={send}
          style={S.sendBtn as React.CSSProperties}
          disabled={sending || !message.trim()}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
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
        div[role="dialog"] ::-webkit-scrollbar-thumb { background: #2b2f3a; border-radius: 8px; }
        div[role="dialog"] ::-webkit-scrollbar-thumb:hover { background: #3a3f4a; }
      `}</style>
    </div>
  );
}
