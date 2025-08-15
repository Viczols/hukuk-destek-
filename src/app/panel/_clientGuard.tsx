// src/app/panel/_clientGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth } from "../../firebase/config";

type Gate = "loading" | "allowed" | "denied";

export default function PanelGuard({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("loading");
  const router = useRouter();

  useEffect(() => {
    const db = getFirestore();

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setGate("denied");
        return;
      }

      try {
        // 1) Custom claim varsa öncelik
        const tok = await getIdTokenResult(u, true);
        const claimRole = tok.claims?.role as string | undefined;
        if (claimRole === "lawyer") {
          setGate("allowed");
          return;
        }
        if (claimRole && claimRole !== "lawyer") {
          setGate("denied");
          return;
        }

        // 2) Claim yoksa Firestore user doc'tan bak
        const snap = await getDoc(doc(db, "users", u.uid));
        const fsRole = snap.exists() ? (snap.data() as any)?.role : undefined;

        if (fsRole === "lawyer") setGate("allowed");
        else setGate("denied");
      } catch (e) {
        // Herhangi bir hata: kararsızken bile ana sayfaya atma; minimum sürtünme
        setGate("denied");
      }
    });

    return () => unsub();
  }, []);

  // YALNIZCA kesin denied ise yönlendir
  useEffect(() => {
    if (gate === "denied") router.replace("/");
  }, [gate, router]);

  if (gate !== "allowed") return null; // loading/denied sırasında içerik göstermiyoruz
  return <>{children}</>;
}
