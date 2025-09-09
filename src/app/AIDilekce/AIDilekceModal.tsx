"use client";

import { useEffect, useState } from "react";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

type DilekceType = "arabuluculuk" | "icra" | "delil_tanik" | "kira_tahliye";
type DraftSections = {
  baslik: string;
  taraflar: string;
  konu: string;
  aciklamalar: string[];
  hukuki_sebepler?: string[];
  deliller?: string[];
  sonuc_istem: string;
  ekler?: string[];
};

type Props = { purchaseId: string; open: boolean; onClose: () => void };
const TYPES: DilekceType[] = ["arabuluculuk", "icra", "delil_tanik", "kira_tahliye"];

/** ---- Basit fetch helper (ai.ts uçlarına JSON POST) ---- */
const AI_BASE = (process.env.NEXT_PUBLIC_AI_BASE || "/ai").replace(/\/$/, "");
async function aiFetch<T>(path: string, payload: any): Promise<T> {
  const res = await fetch(`${AI_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // hata mesajını düzgün yüzeye ver
  if (!res.ok) {
    try {
      const j = await res.json();
      throw new Error(j?.error || `İstek başarısız (${res.status})`);
    } catch {
      throw new Error(`İstek başarısız (${res.status})`);
    }
  }
  return res.json();
}

export default function AIDilekceModal({ purchaseId, open, onClose }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [type, setType] = useState<DilekceType>("arabuluculuk");
  const [sections, setSections] = useState<DraftSections | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Demo form (kategorilere göre genişletebilirsin)
  const [form, setForm] = useState<any>({
    applicant: { name: "", idNumber: "" },
    office: { city: "", bureau: "" },
    subject: "",
    claims: [""],
  });

  // Sunucunun yazdığı ai.state'i canlı takip et
  const [aiState, setAiState] = useState<string>("idle");
  useEffect(() => {
    if (!purchaseId || !open) return;
    const db = getFirestore();
    const ref = doc(db, "purchases", purchaseId, "meta", "ai");
    const unsub = onSnapshot(ref, (s) => setAiState((s.data()?.state as string) || "idle"));
    return () => unsub();
  }, [purchaseId, open]);

  // Modal kapanınca formu sıfırla
  useEffect(() => {
    if (!open) {
      setStep(0);
      setSections(null);
      setForm({
        applicant: { name: "", idNumber: "" },
        office: { city: "", bureau: "" },
        subject: "",
        claims: [""],
      });
      setErrorMsg("");
    }
  }, [open]);

  // Formu ai.ts'in beklediği alanlara normalize et (mock ve OpenAI için faydalı)
  function normalizeInputForServer() {
    const davaci = { ad: form.applicant?.name || "", tc: form.applicant?.idNumber || "" };
    return {
      basvuran: davaci,
      davaci,
      konu: form.subject || "",
      basvuruKonusu: form.subject || "",
      arabuluculukBurosu: form.office?.bureau || "",
      mahkeme: form.office?.bureau || form.office?.city || "",
      talepler: (form.claims || []).filter((x: string) => !!x),
    };
  }

  async function startAI() {
    setLoading(true);
    setErrorMsg("");
    try {
      // /start → { purchaseId, category }
      await aiFetch("/start", { purchaseId, category: type });
      setStep(1);
    } catch (e: any) {
      setErrorMsg(e?.message || "Başlatılamadı");
    } finally {
      setLoading(false);
    }
  }

  async function makeDraft() {
    setLoading(true);
    setErrorMsg("");
    try {
      const input = normalizeInputForServer();
      // /draft → { sections }
      const resp = await aiFetch<{ sections: DraftSections }>("/draft", {
        purchaseId,
        category: type,
        input,
      });
      setSections(resp.sections);
      setStep(2);
    } catch (e: any) {
      setErrorMsg(e?.message || "Taslak oluşturulamadı");
    } finally {
      setLoading(false);
    }
  }

  async function sendToLawyer() {
    if (!sections) return;
    setLoading(true);
    setErrorMsg("");
    try {
      // /render → { docxUrl }
      await aiFetch("/render", { purchaseId, sections });
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message || "Gönderilemedi");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aidilekce-title"
        className="relative mx-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0B0D12] text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_10px_50px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.03]">
          <h3 id="aidilekce-title" className="text-white font-semibold">Yapay Zekâ ile Dilekçe</h3>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-zinc-300 hover:bg-white/10" aria-label="Kapat">✕</button>
        </div>

        <div className="px-4 pb-5 pt-4">
          {/* Adımlar */}
          <div className="mb-4 flex items-center gap-2 text-xs text-zinc-300">
            {["Tür", "Form", "Önizleme"].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`grid size-6 place-items-center rounded-full border ${i===step ? "border-white bg-white text-black" : "border-white/30 text-white"}`}>{i+1}</div>
                <span className={`ml-2 ${i===step ? "text-white font-medium" : ""}`}>{s}</span>
                {i<2 && <div className="mx-2 h-px w-10 bg-white/15" />}
              </div>
            ))}
          </div>

          {errorMsg && (
            <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* Step 0: Kategori seçimi */}
          {step === 0 && (
            <div className="space-y-4">
              <label className="block text-sm text-zinc-300">
                Dilekçe Türü
                <div className="relative">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as DilekceType)}
                    className="mt-1 w-full appearance-none rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace("_", " ").toUpperCase()}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60">▾</span>
                </div>
              </label>

              <div className="flex justify-end">
                <button
                  disabled={loading}
                  onClick={startAI}
                  className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-zinc-200 disabled:opacity-60"
                >
                  Başlat
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Basit form */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <input
                  placeholder="Başvuran Ad Soyad"
                  className="rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  value={form.applicant.name}
                  onChange={(e) => setForm({ ...form, applicant: { ...form.applicant, name: e.target.value } })}
                />
                <input
                  placeholder="T.C. Kimlik No"
                  className="rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  value={form.applicant.idNumber}
                  onChange={(e) => setForm({ ...form, applicant: { ...form.applicant, idNumber: e.target.value } })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    placeholder="Şehir"
                    className="rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    value={form.office.city}
                    onChange={(e) => setForm({ ...form, office: { ...form.office, city: e.target.value } })}
                  />
                  <input
                    placeholder="Arabuluculuk Bürosu / Mahkeme / Müdürlük"
                    className="rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    value={form.office.bureau}
                    onChange={(e) => setForm({ ...form, office: { ...form.office, bureau: e.target.value } })}
                  />
                </div>
                <textarea
                  placeholder="Konu & Talepler"
                  rows={5}
                  className="rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(0)} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-white hover:bg-white/15">Geri</button>
                <button disabled={loading} onClick={makeDraft} className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-zinc-200 disabled:opacity-60">Taslak Oluştur</button>
              </div>
            </div>
          )}

          {/* Step 2: Önizleme */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-100 max-h-[40vh] overflow-auto">
                <pre className="whitespace-pre-wrap leading-relaxed">{JSON.stringify(sections, null, 2)}</pre>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-white hover:bg-white/15">Düzenle</button>
                <button disabled={loading} onClick={sendToLawyer} className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-zinc-200 disabled:opacity-60">Avukata Gönder</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
