// src/hooks/useLawyerPresence.ts
"use client";

import { useEffect, useState } from "react";
import { getDatabase, ref, onValue } from "firebase/database";

function toMillis(v: any): number {
  if (typeof v === "number") return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

/** lawyers/{uid} node'unu dinler, online bilgisini döner */
export function useLawyerPresence(uid?: string | null) {
  const [online, setOnline] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) return;
    const rtdb = getDatabase();
    const r = ref(rtdb, `lawyers/${uid}`);
    const unsub = onValue(r, (snap) => {
      const v = snap.val() || {};
      const isOnline = v?.isOnline === true;
      const hb = toMillis(v?.heartbeatAt);
      const ls = toMillis(v?.lastSeen);
      const fresh = (Date.now() - hb) < 120_000 || (Date.now() - ls) < 120_000; // 2dk tolerans
      setOnline(isOnline && fresh);
      setLastSeen(ls || hb || null);
    });
    return () => unsub();
  }, [uid]);

  return { online, lastSeen };
}
