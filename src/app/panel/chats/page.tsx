"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp as fsServerTimestamp,
  addDoc,
  orderBy,
  limit as fsLimit,
  getDoc,
} from "firebase/firestore";
import {
  ref as rRef,
  onValue,
  query as rQuery,
  orderByChild,
  limitToLast,
  push,
  set,
  update as rUpdate,
  serverTimestamp as rtdbServerTimestamp,
  get as rGet,
  child as rChild,
} from "firebase/database";

import { dbFirestore as db, dbRealtime } from "../../../firebase/config";

/* ================= types & helpers ================= */

type Raw = Record<string, any>;
type CollName = "chatRequests" | "chatTickets";
type ChatReq = {
  id: string;
  purchaseId: string;
  userId: string;
  status: "waiting" | "claimed" | "closed";
  assignedLawyerId?: string | null;
  _src: CollName;
};

const SOURCES: CollName[] = ["chatRequests", "chatTickets"];
const waitingSyn = new Set(["waiting", "new", "open", "created", "pending", "unassigned", "queue"]);
const claimedSyn = new Set(["claimed", "assigned", "in_progress", "accepted", "ongoing", "working"]);
const closedSyn = new Set(["closed", "done", "resolved", "completed", "finished"]);

function normalize(id: string, data: Raw, _src: CollName): ChatReq | null {
  const purchaseId = data.purchaseId ?? data.pid ?? id;
  const userId = data.userId ?? data.uid ?? null;
  const assignedLawyerId = data.assignedLawyerId ?? data.assignedLawyer ?? null;
  const raw = data.status ? String(data.status).toLowerCase() : undefined;

  let status: ChatReq["status"];
  if (raw && waitingSyn.has(raw)) status = "waiting";
  else if (raw && claimedSyn.has(raw)) status = "claimed";
  else if (raw && closedSyn.has(raw)) status = "closed";
  else status = assignedLawyerId ? "claimed" : "waiting";

  if (!purchaseId || !userId) return null;
  return { id, purchaseId, userId, status, assignedLawyerId, _src };
}

function dedupTickets(list: ChatReq[]): ChatReq[] {
  const map = new Map<string, ChatReq>();
  for (const it of list) {
    const prev = map.get(it.purchaseId);
    if (!prev) map.set(it.purchaseId, it);
    else {
      if (prev.status === "waiting" && it.status === "claimed") map.set(it.purchaseId, it);
      else if (prev.status === it.status && prev._src === "chatRequests" && it._src === "chatTickets") {
        map.set(it.purchaseId, it);
      }
    }
  }
  return [...map.values()];
}

/* ============ localStorage unread helpers ============ */
function getLastSeen(roomId: string) {
  try {
    return Number(localStorage.getItem(`lastSeen:${roomId}`)) || 0;
  } catch {
    return 0;
  }
}
function setLastSeen(roomId: string, ms: number) {
  try {
    localStorage.setItem(`lastSeen:${roomId}`, String(ms));
  } catch {}
}

/* ============ email helpers ============ */
function maskEmail(raw: string) {
  const [local, domain] = raw.split("@");
  if (!domain) return raw;
  const [host, ...rest] = domain.split(".");
  const tld = rest.join(".");
  const m = (s: string) =>
    s.length <= 2 ? s[0] + "*" : s[0] + "*".repeat(Math.max(1, Math.min(4, s.length - 2))) + s.slice(-1);
  return `${m(local)}@${m(host)}${tld ? "." + tld : ""}`;
}

async function fetchEmailByUid(uid: string): Promise<string | null> {
  try {
    const d = await getDoc(doc(db, "users", uid));
    if (d.exists()) {
      const v: any = d.data();
      const email = v?.email ?? v?.mail ?? v?.eMail ?? null;
      if (email && typeof email === "string") return email;
    }
  } catch {}
  try {
    const p1 = await rGet(rChild(rRef(dbRealtime), `users/${uid}/profile/email`));
    const p2 = await rGet(rChild(rRef(dbRealtime), `users/${uid}/email`));
    const email = (p1.exists() && p1.val()) || (p2.exists() && p2.val()) || null;
    if (email && typeof email === "string") return email;
  } catch {}
  return null;
}

/* ==================================================== */

export default function ChatsPage() {
  const auth = getAuth();
  const [all, setAll] = useState<ChatReq[]>([]);
  const [q, setQ] = useState("");

  // uid -> masked email cache
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});

  // bekleyen + atanmışları dinle
  useEffect(() => {
    const unsubs = SOURCES.map((name) => {
      const qRef = query(collection(db, name));
      return onSnapshot(qRef, (snap) => {
        const arr: ChatReq[] = [];
        snap.forEach((d) => {
          const n = normalize(d.id, d.data() as Raw, name);
          if (n) arr.push(n);
        });
        setAll((prev) => {
          const others = prev.filter((x) => x._src !== name);
          return dedupTickets([...others, ...arr]);
        });
      });
    });
    return () => unsubs.forEach((u) => u());
  }, []);

  // email’leri toplu çek & önbelleğe koy
  useEffect(() => {
    const uids = Array.from(new Set(all.map((x) => x.userId))).filter((u) => !(u in emailMap));
    if (uids.length === 0) return;
    (async () => {
      const entries: [string, string][] = [];
      for (const uid of uids) {
        const mail = await fetchEmailByUid(uid);
        if (mail) entries.push([uid, maskEmail(mail)]);
      }
      if (entries.length) {
        setEmailMap((m) => {
          const copy = { ...m };
          for (const [k, v] of entries) copy[k] = v;
          return copy;
        });
      }
    })();
  }, [all, emailMap]);

  const waiting = useMemo(() => all.filter((x) => x.status === "waiting"), [all]);
  const mine = useMemo(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    return all.filter((x) => x.assignedLawyerId === uid && x.status !== "closed");
  }, [all, auth.currentUser?.uid]);

  // Arama (purchaseId / masked email / uid)
  const filterText = q.trim().toLowerCase();
  const match = (t: ChatReq) => {
    if (!filterText) return true;
    const mail = emailMap[t.userId] ?? "";
    return (
      t.purchaseId.toLowerCase().includes(filterText) ||
      t.userId.toLowerCase().includes(filterText) ||
      mail.toLowerCase().includes(filterText)
    );
  };
  const waitingFiltered = useMemo(() => waiting.filter(match), [waiting, filterText, emailMap]);
  const mineFiltered = useMemo(() => mine.filter(match), [mine, filterText, emailMap]);

  const claim = async (item: ChatReq) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return alert("Önce giriş yapın.");
    const docRef = doc(db, item._src, item.id);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error("Kayıt bulunamadı.");

      const data = snap.data() as Raw;
      const assigned = data.assignedLawyerId ?? data.assignedLawyer ?? null;
      const raw = data.status ? String(data.status).toLowerCase() : undefined;
      const isWaiting = raw ? waitingSyn.has(raw) : !assigned;
      const isClaimed = raw ? claimedSyn.has(raw) : !!assigned;
      const isClosed = raw ? closedSyn.has(raw) : false;

      if (assigned || isClaimed || isClosed || !isWaiting) {
        throw new Error("Bu istek zaten üstlenilmiş.");
      }

      tx.set(
        docRef,
        { assignedLawyerId: uid, assignedLawyer: uid, status: "claimed", updatedAt: fsServerTimestamp() },
        { merge: true }
      );
    });

    try {
      await rUpdate(rRef(dbRealtime, `chatTickets/${item.purchaseId}`), {
        assignedLawyer: auth.currentUser?.uid ?? null,
        status: "claimed",
        updatedAt: Date.now(),
      });
    } catch {}
  };

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* Başlık + arama */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Sohbet Paneli</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs sm:text-sm">
            <span className="rounded-full bg-zinc-200 px-2 py-1 text-zinc-800">
              Bekleyen: <strong>{waiting.length}</strong>
            </span>
            <span className="rounded-full bg-zinc-200 px-2 py-1 text-zinc-800">
              Atanmış: <strong>{mine.length}</strong>
            </span>
          </div>

          {/* modern arama alanı */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ara: purchaseId / e-posta / uid"
              className="w-64 rounded-lg border border-zinc-300 bg-zinc-100 pl-9 pr-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/15"
            />
          </div>
        </div>
      </div>

      {/* Bekleyenler */}
      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Bekleyen İstekler
            <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-800">
              {waitingFiltered.length}
            </span>
          </h2>
        </header>

        <div className="grid gap-3">
          {waitingFiltered.length === 0 && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-4 text-sm text-zinc-600">
              Sonuç yok.
            </div>
          )}
          {waitingFiltered.map((w) => (
            <div
              key={`${w._src}-${w.id}`}
              className="rounded-xl border border-zinc-300 bg-zinc-100/80 backdrop-blur shadow-sm hover:shadow-md transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-700">
                    purchaseId: <span className="font-mono">{w.purchaseId}</span>
                  </div>
                  <div className="text-sm text-zinc-800">
                    Kullanıcı:{" "}
                    <span title={emailMap[w.userId] ? "Maskeleme uygulanmıştır" : "E-posta bulunamadı"}>
                      {emailMap[w.userId] ?? w.userId}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">kaynak: {w._src}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => claim(w)}
                    className="rounded-lg bg-zinc-800 px-3 py-2 text-white hover:bg-zinc-700 transition"
                  >
                    Üstlen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Atanmışlar */}
      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Atanmış Sohbetler
            <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-800">
              {mineFiltered.length}
            </span>
          </h2>
        </header>

        <div className="grid gap-3">
          {mineFiltered.length === 0 && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-4 text-sm text-zinc-600">
              Sonuç yok.
            </div>
          )}

          {mineFiltered.map((c) => (
            <PanelChat
              key={`${c._src}-${c.id}`}
              purchaseId={c.purchaseId}
              userIdLabel={emailMap[c.userId] ?? c.userId}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* =================== PanelChat =================== */

type Msg = {
  id: string;
  text: string;
  from?: string | null;
  role?: "user" | "lawyer";
  createdAt?: number;
  _src: "rtdb" | "fs";
};

function PanelChat({
  purchaseId,
  userIdLabel,
}: {
  purchaseId: string;
  userIdLabel: string; // masked e-posta veya uid
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [rtdbErr, setRtdbErr] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // unread & görsel highlight
  const [unread, setUnread] = useState(0);
  const [pulse, setPulse] = useState(false);
  const unreadRef = useRef(0);
  useEffect(() => {
    unreadRef.current = unread;
  }, [unread]);

  // -------- mini dinleyici (akkordion KAPALIYKEN)
  useEffect(() => {
    if (open) return;
    const mRef = rRef(dbRealtime, `chatRooms/${purchaseId}/messages`);
    const rq = rQuery(mRef, orderByChild("createdAt"), limitToLast(1));
    const off = onValue(
      rq,
      (snap) => {
        snap.forEach((child) => {
          const v = child.val() || {};
          const role = v.role ?? v.fromRole ?? v.senderRole;
          const created: number | undefined =
            (typeof v.createdAt === "number" ? v.createdAt : undefined) ??
            (typeof v.ts === "number" ? v.ts : undefined);
          if ((role ?? "user") === "user" && typeof created === "number") {
            const lastSeen = getLastSeen(purchaseId);
            if (created > lastSeen) {
              setPulse(true);
              setTimeout(() => setPulse(false), 1200);
              setUnread((u) => u + 1);
              // 🔇 izin hatasını UI'da göstermiyoruz
            }
          }
        });
      },
      (err) => {
        setRtdbErr(err?.message || "RTDB okuma hatası");
        console.warn("[RTDB]", err?.message || err);
      }
    );

    const fsq = query(
      collection(db, "chatRooms", purchaseId, "messages"),
      orderBy("createdAt", "desc"),
      fsLimit(1)
    );
    const unsub = onSnapshot(
      fsq,
      (snap) => {
        snap.forEach((d) => {
          const v = d.data() || {};
          const role = v.role ?? "user";
          const created: number | null = v.createdAt?.toMillis?.() ?? v.ts ?? null;
          if (role === "user" && typeof created === "number") {
            const lastSeen = getLastSeen(purchaseId);
            if (created > lastSeen) {
              setPulse(true);
              setTimeout(() => setPulse(false), 1200);
              setUnread((u) => u + 1);
            }
          }
        });
      },
      () => {}
    );

    return () => {
      off();
      unsub();
    };
  }, [open, purchaseId]);

  // -------- tam dinleyici (akkordion AÇIKKEN)
  useEffect(() => {
    if (!open) return;

    const mRef = rRef(dbRealtime, `chatRooms/${purchaseId}/messages`);
    const rq = rQuery(mRef, orderByChild("createdAt"), limitToLast(200));
    const off = onValue(
      rq,
      (snap) => {
        setRtdbErr(null);
        const arr: Msg[] = [];
        snap.forEach((child) => {
          const v = child.val() || {};
          const text: string = v.text ?? v.message ?? "";
          const role: string | undefined = v.role ?? v.fromRole ?? v.senderRole;
          const created: number | undefined =
            (typeof v.createdAt === "number" ? v.createdAt : undefined) ??
            (typeof v.ts === "number" ? v.ts : undefined) ??
            (typeof v.time === "number" ? v.time : undefined);
          arr.push({
            id: `rtdb:${child.key}`,
            text,
            from: v.from ?? v.uid ?? null,
            role: role === "lawyer" ? "lawyer" : "user",
            createdAt: created,
            _src: "rtdb",
          });
        });
        setMsgs((prev) => {
          const merged = mergeByTime(prev, arr);
          setLastSeen(purchaseId, Date.now());
          setUnread(0);
          return merged;
        });
        nextTickScroll(listRef);
      },
      (err) => {
        setRtdbErr(err?.message || "RTDB okuma hatası");
        console.warn("[RTDB]", err?.message || err);
      }
    );

    const fsq = query(
      collection(db, "chatRooms", purchaseId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      fsq,
      (snap) => {
        const arr: Msg[] = [];
        snap.forEach((d) => {
          const v = d.data() || {};
          const text: string = v.text ?? v.message ?? "";
          const ts = v.createdAt?.toMillis?.() ?? v.ts ?? v.time ?? null;
          arr.push({
            id: `fs:${d.id}`,
            text,
            from: v.from ?? v.uid ?? null,
            role: v.role === "lawyer" ? "lawyer" : "user",
            createdAt: typeof ts === "number" ? ts : undefined,
            _src: "fs",
          });
        });
        setMsgs((prev) => {
          const merged = mergeByTime(prev, arr);
          setLastSeen(purchaseId, Date.now());
          setUnread(0);
          return merged;
        });
        nextTickScroll(listRef);
      },
      () => {}
    );

  return () => {
      off();
      unsub();
    };
  }, [open, purchaseId]);

  const toggleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (!willOpen) {
      setLastSeen(purchaseId, Date.now());
      setUnread(0);
    } else {
      setUnread(0);
      setLastSeen(purchaseId, Date.now());
    }
  };

  const send = async () => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return alert("Önce giriş yapın.");
    const text = input.trim();
    if (!text) return;

    const now = Date.now();

    const listPath = rRef(dbRealtime, `chatRooms/${purchaseId}/messages`);
    const msgRef = push(listPath);
    await set(msgRef, {
      text,
      from: uid,
      role: "lawyer",
      createdAt: rtdbServerTimestamp(),
      ts: now,
    });

    try {
      await addDoc(collection(db, "chatRooms", purchaseId, "messages"), {
        text,
        from: uid,
        role: "lawyer",
        createdAt: fsServerTimestamp(),
        ts: now,
      });
    } catch {}

    setInput("");
    setLastSeen(purchaseId, Date.now());
    setUnread(0);
    if (open) nextTickScroll(listRef);
  };

  return (
    <div
      className={[
        // Gri ağırlıklı ana yüzey
        "overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-100/90 backdrop-blur shadow-sm transition",
        pulse ? "ring-2 ring-rose-400" : "",
      ].join(" ")}
    >
      <button
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-zinc-100"
      >
        <div className="min-w-0">
          <div className="font-medium text-zinc-900">
            #{purchaseId} <span className="text-zinc-600">• {userIdLabel}</span>
          </div>
          {/* rtdbErr mevcut olsa bile son kullanıcıya göstermiyoruz */}
        </div>

        <div className="flex items-center gap-2">
          {unread > 0 && (
            <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-white">{unread}</span>
          )}
          <div className="shrink-0 rounded-full bg-zinc-200 px-2 py-1 text-xs text-zinc-800">
            {open ? "Kapat" : "Aç"}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-300 bg-zinc-100 p-3">
          <div
            ref={listRef}
            className="h-64 overflow-y-auto rounded-xl bg-zinc-100 p-3 text-sm shadow-inner"
          >
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`mb-2 flex ${m.role === "lawyer" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                    m.role === "lawyer"
                      ? "bg-zinc-800 text-white"      // siyahı aksan olarak kullan
                      : "bg-zinc-200 text-zinc-900"   // kullanıcı mesajı: yoğun gri
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  {m.createdAt && (
                    <div className="mt-1 text-[10px] opacity-70">{formatTime(m.createdAt)}</div>
                  )}
                </div>
              </div>
            ))}
            {msgs.length === 0 && <div className="text-center text-zinc-500">Mesaj yok.</div>}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Mesaj yaz..."
              className="flex-1 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/15"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Gönder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= utils ================= */
type MsgT = Msg;
function mergeByTime(prev: MsgT[], incoming: MsgT[]) {
  const map = new Map<string, MsgT>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  const arr = [...map.values()];
  arr.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return arr;
}
function formatTime(ms: number) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function nextTickScroll(ref: React.RefObject<HTMLDivElement | null>) {
  requestAnimationFrame(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });
}
