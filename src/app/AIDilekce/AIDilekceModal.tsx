"use client";

import { useEffect, useMemo, useState } from "react";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

/** Türler */
type DilekceType = "arabuluculuk" | "icra" | "delil_tanik" | "kira_tahliye";

type Props = {
  purchaseId: string;
  open: boolean;
  onClose: () => void;
};

const TYPES: DilekceType[] = ["arabuluculuk", "icra", "delil_tanik", "kira_tahliye"];

/* =============================================================================
   BASE & PREFIX — akıllı ve tekrarsız candidate üretimi + parent base fallback
   ========================================================================== */
const AI_BASE_RAW =
  process.env.NEXT_PUBLIC_AI_BASE ||            // ← ÖNCE AI_BASE
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE ||     // sonra functions
  "/ai";

const AI_BASE = AI_BASE_RAW.replace(/\/+$/, "");
const AI_PREFIX_RAW = (process.env.NEXT_PUBLIC_AI_PREFIX || "").trim();
const AI_PREFIX = AI_PREFIX_RAW ? AI_PREFIX_RAW.replace(/\/+$/, "") : "";

/** BASE şu sonek ile bitiyor mu? (örn "/api", "/ai") */
function baseHasSuffix(base: string, suffix: string) {
  if (!suffix) return false;
  const clean = suffix.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) return false;
  return new RegExp(`/${clean}$`).test(base);
}

/** /api, /ai, /v1, /api/v1 gibi sonekleri tekrar tekrar eklememek için yardımcı */
function uniqueAppend(base: string, suffix: string) {
  const b = base.replace(/\/+$/, "");
  const s = suffix.replace(/^\/+/, "");
  if (!s) return b;
  if (new RegExp(`/${s}$`).test(b)) return b; // zaten bu sonek ile bitiyor
  return `${b}/${s}`;
}

/** BASE’in ebeveynini (son segmenti at) döndür: ".../api" -> "..." */
function parentBase(base: string) {
  const parts = base.replace(/\/+$/, "").split("/");
  if (parts.length <= 3) return base; // https://host (daha fazla kısaltma yok)
  parts.pop();
  return parts.join("/");
}

/** Bir path’i çeşitli prefix ve sürümlerle dene (tekrarsız ve mantıklı sıra) */
function buildCandidates(path: string) {
  const p = path.startsWith("/") ? path.slice(1) : path; // baştaki /’ı at
  const tried = new Set<string>();
  const out: string[] = [];

  const bases: string[] = [];
  bases.push(AI_BASE);

  // BASE "/api" veya "/v1" ile bitiyorsa ebeveyni de dene
  const pb = parentBase(AI_BASE);
  if (pb !== AI_BASE) bases.push(pb);

  const variants = (base: string) => {
    const urls: string[] = [];

    // 1) ENV ile gelen PREFIX (ör. "/ai" veya ""), varsa uygula
    let b1 = base;
    if (AI_PREFIX) b1 = uniqueAppend(b1, AI_PREFIX);
    urls.push(`${b1}/${p}`);

    // 2) Sadece BASE
    urls.push(`${base}/${p}`);

    // 3) BASE + "/ai" (BASE zaten /ai ile bitmiyorsa)
    if (!baseHasSuffix(base, "/ai")) {
      const b3 = uniqueAppend(base, "/ai");
      urls.push(`${b3}/${p}`);
    }

    // 4) BASE + "/api/ai" (BASE zaten /api/ai ile bitmiyorsa)
    if (!baseHasSuffix(base, "/api/ai")) {
      let b4 = base;
      if (!baseHasSuffix(b4, "/api")) b4 = uniqueAppend(b4, "/api");
      b4 = uniqueAppend(b4, "/ai");
      urls.push(`${b4}/${p}`);
    }

    // 5) Yaygın sürümler: /v1, /api/v1, /api/v1/ai
    const b5 = uniqueAppend(base, "/v1");
    urls.push(`${b5}/${p}`);

    let b6 = base;
    if (!baseHasSuffix(b6, "/api")) b6 = uniqueAppend(b6, "/api");
    b6 = uniqueAppend(b6, "/v1");
    urls.push(`${b6}/${p}`);

    let b7 = uniqueAppend(b6, "/ai"); // /api/v1/ai
    urls.push(`${b7}/${p}`);

    return urls;
  };

  for (const b of bases) {
    for (const u of variants(b)) {
      if (!tried.has(u)) { out.push(u); tried.add(u); }
    }
  }

  return out;
}

/** ---- ai.ts uçlarına JSON POST (çoklu deneme + tür doğrulama) ---- */
async function aiFetch<T>(path: string, payload: any): Promise<T> {
  const candidates = buildCandidates(path);
  let lastErr: any = null;

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // İçerik tipi JSON değilse (örn. "<!DOCTYPE html>")
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) {
        const txt = await res.text();
        const firstLine = (txt || "").split("\n")[0]?.slice(0, 160) || "Bilinmeyen hata";
        throw new Error(`Beklenmeyen yanıt: ${firstLine}`);
      }

      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || `İstek başarısız (${res.status})`);
      return j as T;
    } catch (e: any) {
      lastErr = e;
      // sıradaki adayı dene
    }
  }
  throw lastErr || new Error("Sunucuya ulaşılamadı.");
}
/* ---------- yardımcılar ---------- */
function setIn<T extends object>(obj: T, path: (string | number)[], value: any): T {
  if (path.length === 0) return obj as T;
  const [head, ...rest] = path;
  const clone: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  if (rest.length === 0) clone[head as any] = value;
  else clone[head as any] = setIn(clone[head as any] ?? (typeof rest[0] === "number" ? [] : {}), rest, value);
  return clone as T;
}
function addListItem<T extends object>(obj: T, path: (string | number)[], factory: () => any): T {
  const list = path.reduce<any>((acc, key) => (acc ? acc[key as any] : undefined), obj) || [];
  const next = [...list, factory()];
  return setIn(obj, path, next);
}
function removeListItem<T extends object>(obj: T, path: (string | number)[], idx: number): T {
  const list = path.reduce<any>((acc, key) => (acc ? acc[key as any] : undefined), obj) || [];
  const next = list.filter((_: any, i: number) => i !== idx);
  return setIn(obj, path, next);
}

/* ---------- kategoriye göre boş form ---------- */
function emptyFormFor(type: DilekceType) {
  const common = {
    basvuran: { adSoyad: "", tcVkn: "", telefon: "", email: "", adres: "" },
    karsiTaraflar: [{ adSoyad: "", tcVkn: "", telefon: "", email: "", adres: "" }],
    yargiYeri: { sehir: "", kurum: "", adi: "", dosyaNo: "" },
    deliller: [] as string[],
    talepler: [] as string[],
    ekBilgi: { notlar: "", iban: "", tarih: "" },
  };

  if (type === "arabuluculuk") {
    return {
      ...common,
      yargiYeri: { sehir: "", kurum: "Arabuluculuk Bürosu", adi: "", dosyaNo: "" },
      basvuru: { tarih: "", konu: "", beyanlar: [""], kalemler: [""] },
    };
  }
  if (type === "icra") {
    return {
      ...common,
      yargiYeri: { sehir: "", kurum: "İcra Dairesi", adi: "", dosyaNo: "" },
      tebligat: { tarih: "", sekil: "" },
      itiraz: {
        borca: false,
        miktara: false,
        faize: false,
        imzaya: false,
        yetkiye: false,
        yetkiliDaire: "",
        diger: "",
      },
      aciklama: "",
    };
  }
  if (type === "delil_tanik") {
    return {
      ...common,
      yargiYeri: { sehir: "", kurum: "Mahkeme", adi: "", dosyaNo: "" },
      mahkeme: { gorev: "" },
      taraf: { sifati: "davaci" as "davaci" | "davali" },
      vekil: { adSoyad: "", baro: "", adres: "" },
      taniklar: [{ adSoyad: "", tcVkn: "", telefon: "", adres: "", bilecekleri: "" }],
    };
  }
  // kira_tahliye
  return {
    ...common,
    kira: {
      adres: "",
      cins: "",
      kullanimAmaci: "",
      kirayaVeren: { adSoyad: "", tcVkn: "", telefon: "", adres: "" },
      kiraci: { adSoyad: "", tcVkn: "", telefon: "", adres: "" },
      aylikKira: "",
      yillikKira: "",
      odemeGunu: "",
      bankaAdi: "",
      hesapNo: "",
      iban: "",
      baslangic: "",
      bitis: "",
      sure: "",
      depozito: "",
      ozelMaddeler: [] as string[],
      birakilanEsyalar: [] as string[],
    },
    tahliyeTaahhut: { tahliyeTarihi: "", taahhutTarihi: "" },
  };
}

/* ---------- normalize: ai.ts için tek JSON ---------- */
function normalizeInputForServer(form: any, kategori: DilekceType) {
  const basvuran = {
    adSoyad: (form?.basvuran?.adSoyad || "").trim(),
    tcVkn: (form?.basvuran?.tcVkn || "").trim(),
    telefon: (form?.basvuran?.telefon || "").trim(),
    email: (form?.basvuran?.email || "").trim(),
    adres: (form?.basvuran?.adres || "").trim(),
  };

  const karsiTaraflar = (form?.karsiTaraflar || [])
    .map((k: any) => ({
      adSoyad: (k?.adSoyad || "").trim(),
      tcVkn: (k?.tcVkn || "").trim(),
      telefon: (k?.telefon || "").trim(),
      email: (k?.email || "").trim(),
      adres: (k?.adres || "").trim(),
    }))
    .filter((k: any) => k.adSoyad);

  const yargiYeri = {
    sehir: (form?.yargiYeri?.sehir || "").trim(),
    kurum: (form?.yargiYeri?.kurum || "").trim(),
    adi: (form?.yargiYeri?.adi || "").trim(),
    dosyaNo: (form?.yargiYeri?.dosyaNo || "").trim(),
  };

  const deliller = (form?.deliller || []).filter((d: string) => d && d.trim());
  const talepler = (form?.talepler || []).filter((t: string) => t && t.trim());
  const ekBilgi = {
    notlar: (form?.ekBilgi?.notlar || "").trim(),
    iban: (form?.ekBilgi?.iban || "").trim(),
    tarih: (form?.ekBilgi?.tarih || "").trim(),
  };

  const out: any = {
    kategori,
    basvuran,
    karsiTaraflar,
    yargiYeri,
    deliller,
    talepler,
    ekBilgi,

    // geriye uyumluluk
    davaci: { ad: basvuran.adSoyad, tc: basvuran.tcVkn, adres: basvuran.adres },
    arabuluculukBurosu: yargiYeri.kurum === "Arabuluculuk Bürosu" ? yargiYeri.adi : "",
    mahkeme: yargiYeri.kurum === "Mahkeme" ? yargiYeri.adi : yargiYeri.adi,
  };

  if (kategori === "arabuluculuk") {
    out.basvuru = {
      tarih: (form?.basvuru?.tarih || "").trim(),
      konu: (form?.basvuru?.konu || "").trim(),
      beyanlar: (form?.basvuru?.beyanlar || []).filter((x: string) => x && x.trim()),
      kalemler: (form?.basvuru?.kalemler || []).filter((x: string) => x && x.trim()),
    };
    out.konu = out.basvuru.konu;
  }

  if (kategori === "icra") {
    out.tebligat = {
      tarih: (form?.tebligat?.tarih || "").trim(),
      sekil: (form?.tebligat?.sekil || "").trim(),
    };
    out.itiraz = {
      borca: !!form?.itiraz?.borca,
      miktara: !!form?.itiraz?.miktara,
      faize: !!form?.itiraz?.faize,
      imzaya: !!form?.itiraz?.imzaya,
      yetkiye: !!form?.itiraz?.yetkiye,
      yetkiliDaire: (form?.itiraz?.yetkiliDaire || "").trim(),
      diger: (form?.itiraz?.diger || "").trim(),
    };
    out.aciklama = (form?.aciklama || "").trim();
    out.konu = `İcra dosyası ${yargiYeri.adi} ${yargiYeri.dosyaNo}`;
  }

  if (kategori === "delil_tanik") {
    out.mahkeme = { ...out.mahkeme, gorev: (form?.mahkeme?.gorev || "").trim() };
    out.taraf = { sifati: form?.taraf?.sifati || "davaci" };
    out.vekil = {
      adSoyad: (form?.vekil?.adSoyad || "").trim(),
      baro: (form?.vekil?.baro || "").trim(),
      adres: (form?.vekil?.adres || "").trim(),
    };
    out.taniklar = (form?.taniklar || [])
      .map((t: any) => ({
        adSoyad: (t?.adSoyad || "").trim(),
        tcVkn: (t?.tcVkn || "").trim(),
        telefon: (t?.telefon || "").trim(),
        adres: (t?.adres || "").trim(),
        bilecekleri: (t?.bilecekleri || "").trim(),
      }))
      .filter((t: any) => t.adSoyad);
    out.konu = "Delil ve Tanık Bildirimi";
  }

  if (kategori === "kira_tahliye") {
    out.kira = {
      ...form.kira,
      adres: (form?.kira?.adres || "").trim(),
      cins: (form?.kira?.cins || "").trim(),
      kullanimAmaci: (form?.kira?.kullanimAmaci || "").trim(),
      kirayaVeren: {
        adSoyad: (form?.kira?.kirayaVeren?.adSoyad || "").trim(),
        tcVkn: (form?.kira?.kirayaVeren?.tcVkn || "").trim(),
        telefon: (form?.kira?.kirayaVeren?.telefon || "").trim(),
        adres: (form?.kira?.kirayaVeren?.adres || "").trim(),
      },
      kiraci: {
        adSoyad: (form?.kira?.kiraci?.adSoyad || "").trim(),
        tcVkn: (form?.kira?.kiraci?.tcVkn || "").trim(),
        telefon: (form?.kira?.kiraci?.telefon || "").trim(),
        adres: (form?.kira?.kiraci?.adres || "").trim(),
      },
      aylikKira: (form?.kira?.aylikKira || "").trim(),
      yillikKira: (form?.kira?.yillikKira || "").trim(),
      odemeGunu: (form?.kira?.odemeGunu || "").trim(),
      bankaAdi: (form?.kira?.bankaAdi || "").trim(),
      hesapNo: (form?.kira?.hesapNo || "").trim(),
      iban: (form?.kira?.iban || "").trim(),
      baslangic: (form?.kira?.baslangic || "").trim(),
      bitis: (form?.kira?.bitis || "").trim(),
      sure: (form?.kira?.sure || "").trim(),
      depozito: (form?.kira?.depozito || "").trim(),
      ozelMaddeler: (form?.kira?.ozelMaddeler || []).filter((x: string) => x && x.trim()),
      birakilanEsyalar: (form?.kira?.birakilanEsyalar || []).filter((x: string) => x && x.trim()),
    };
    out.tahliyeTaahhut = {
      tahliyeTarihi: (form?.tahliyeTaahhut?.tahliyeTarihi || "").trim(),
      taahhutTarihi: (form?.tahliyeTaahhut?.taahhutTarihi || "").trim(),
    };
    out.konu = "Kira Sözleşmesi / Tahliye Taahhüdü";
  }

  return out;
}

/* =============================================================================
   ANA BİLEŞEN
   ========================================================================== */
export default function AIDilekceModal({ purchaseId, open, onClose }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [type, setType] = useState<DilekceType>("arabuluculuk");
  const [html, setHtml] = useState<string>("");
  const [autoRenderStarted, setAutoRenderStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [form, setForm] = useState<any>(emptyFormFor("arabuluculuk"));

  // Sunucu meta durumu
  const [aiState, setAiState] = useState<string>("idle");
  const [aiMeta, setAiMeta] = useState<{ draftDocxUrl?: string; draftPdfUrl?: string; firstSuccessAt?: any }>({});

  const alreadySent = useMemo(
    () => aiState === "awaiting_review" || !!aiMeta.draftDocxUrl || !!aiMeta.draftPdfUrl,
    [aiState, aiMeta]
  );

  /* ---------- Firestore dinleme ---------- */
  useEffect(() => {
    if (!purchaseId || !open) return;
    const db = getFirestore();
    const ref = doc(db, "purchases", purchaseId);
    const unsub = onSnapshot(ref, (snap) => {
      const d: any = snap.data() || {};
      const meta = d?.meta?.ai || {};
      setAiState(meta?.state || "idle");
      setAiMeta({
        draftDocxUrl: meta?.draftDocxUrl,
        draftPdfUrl: meta?.draftPdfUrl,
        firstSuccessAt: meta?.firstSuccessAt,
      });
    });
    return () => unsub();
  }, [purchaseId, open]);

  /* ---------- Modal açıldığında başlangıç ---------- */
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setType("arabuluculuk");
    setForm(emptyFormFor("arabuluculuk"));
    setHtml("");
    setAutoRenderStarted(false);
    setErrorMsg("");
  }, [open]);

  /* ---------- /start (404 olursa uyarıp Form’a geç) ---------- */
  async function startAI() {
    setLoading(true);
    setErrorMsg("");
    try {
      try {
        await aiFetch("/start", { purchaseId, category: type });
      } catch (e: any) {
        if (String(e?.message || "").includes("404 @")) {
          console.warn("AI /start 404; form adımına geçiliyor.");
        } else {
          throw e;
        }
      }
      setStep(1);
    } catch (e: any) {
      setErrorMsg(String(e?.message || "Başlatılamadı"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- /draft: HTML üret ---------- */
  async function makeDraft() {
    if (alreadySent) {
      setStep(2);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const input = normalizeInputForServer(form, type);
      const resp = await aiFetch<{ html: string; version?: number }>("/draft", {
        purchaseId,
        category: type,
        input,
      });
      setHtml(resp.html || "");
      setStep(2);
    } catch (e: any) {
      setErrorMsg(String(e?.message || "Önizleme oluşturulamadı"));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Step 2’de otomatik /render (DOCX) ---------- */
  useEffect(() => {
    if (step === 2 && html && !autoRenderStarted && !alreadySent) {
      setAutoRenderStarted(true);
      (async () => {
        try {
          setLoading(true);
          await aiFetch("/render", { purchaseId, html, format: "docx" }); // PDF için "pdf"
        } catch (e: any) {
          setErrorMsg(String(e?.message || "Dilekçe oluşturulamadı"));
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [step, html, autoRenderStarted, alreadySent, purchaseId]);

  /* ----------- UI yardımcıları ----------- */
  const setF = (path: (string | number)[], val: any) => setForm((f: any) => setIn(f, path, val));
  const addRow = (path: (string | number)[], factory: () => any) => setForm((f: any) => addListItem(f, path, factory));
  const delRow = (path: (string | number)[], idx: number) => setForm((f: any) => removeListItem(f, path, idx));

  const titleByType = useMemo(() => {
    switch (type) {
      case "arabuluculuk": return "Arabuluculuk Başvuru";
      case "icra": return "İcra – İtiraz / Açıklama";
      case "delil_tanik": return "Delil & Tanık Bildirimi";
      case "kira_tahliye": return "Kira Sözleşmesi / Tahliye";
    }
  }, [type]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div role="dialog" aria-modal="true" aria-labelledby="aidilekce-title" className="relative mx-4 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#0B0D12] text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_10px_50px_rgba(0,0,0,0.7)]">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.03]">
          <h3 id="aidilekce-title" className="text-white font-semibold">Yapay Zekâ ile Dilekçe</h3>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-zinc-300 hover:bg-white/10" aria-label="Kapat">✕</button>
        </div>

        <div className="px-4 pb-5 pt-4 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "thin", msOverflowStyle: "auto" }}>
          {/* Adımlar */}
          <div className="mb-4 flex items-center gap-2 text-xs text-zinc-300">
            {["Tür", "Form", "Önizleme"].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`grid size-6 place-items-center rounded-full border ${i === step ? "border-white bg-white text-black" : "border-white/30 text-white"}`}>{i + 1}</div>
                <span className={`ml-2 ${i === step ? "text-white font-medium" : ""}`}>{s}</span>
                {i < 2 && <div className="mx-2 h-px w-10 bg-white/15" />}
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
                    onChange={(e) => {
                      const t = e.target.value as DilekceType;
                      setType(t);
                      setForm(emptyFormFor(t));
                    }}
                    className="mt-1 w-full appearance-none rounded-lg bg-black/40 text-white placeholder-white/50 ring-1 ring-white/10 border border-white/5 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace("_", " ").toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60">▾</span>
                </div>
              </label>
              <div className="flex justify-end">
                <button disabled={loading} onClick={startAI} className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-zinc-200 disabled:opacity-60">
                  Başlat
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Form */}
          {step === 1 && (
            <div className="space-y-6">
              <h4 className="text-sm font-semibold text-white">{titleByType}</h4>

              {/* Başvuran */}
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs text-zinc-400">Başvuran Bilgileri</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input placeholder="Ad Soyad" value={form.basvuran.adSoyad} onChange={(e) => setF(["basvuran", "adSoyad"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="TC/VKN" value={form.basvuran.tcVkn} onChange={(e) => setF(["basvuran", "tcVkn"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="Telefon" value={form.basvuran.telefon} onChange={(e) => setF(["basvuran", "telefon"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="E-posta" value={form.basvuran.email} onChange={(e) => setF(["basvuran", "email"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                </div>
                <input placeholder="Adres" value={form.basvuran.adres} onChange={(e) => setF(["basvuran", "adres"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
              </fieldset>

              {/* Karşı Taraf(lar) */}
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs text-zinc-400">Karşı Taraf Bilgileri</legend>
                {form.karsiTaraflar.map((k: any, i: number) => (
                  <div key={i} className="rounded-xl border border-white/10 p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Ad Soyad / Ünvan" value={k.adSoyad} onChange={(e) => setF(["karsiTaraflar", i, "adSoyad"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="TC/VKN" value={k.tcVkn} onChange={(e) => setF(["karsiTaraflar", i, "tcVkn"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Telefon" value={k.telefon} onChange={(e) => setF(["karsiTaraflar", i, "telefon"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="E-posta" value={k.email} onChange={(e) => setF(["karsiTaraflar", i, "email"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input placeholder="Adres" value={k.adres} onChange={(e) => setF(["karsiTaraflar", i, "adres"], e.target.value)} className="flex-1 rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      {form.karsiTaraflar.length > 1 && (
                        <button onClick={() => delRow(["karsiTaraflar"], i)} className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10">Sil</button>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={() => addRow(["karsiTaraflar"], () => ({ adSoyad: "", tcVkn: "", telefon: "", email: "", adres: "" }))} className="rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/10">
                  + Karşı Taraf Ekle
                </button>
              </fieldset>

              {/* Yargı Yeri */}
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs text-zinc-400">Yargı Yeri</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input placeholder="Şehir" value={form.yargiYeri.sehir} onChange={(e) => setF(["yargiYeri", "sehir"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="Kurum (Arabuluculuk Bürosu / Mahkeme / İcra Dairesi)" value={form.yargiYeri.kurum} onChange={(e) => setF(["yargiYeri", "kurum"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="Adı (örn: İstanbul Anadolu Arabuluculuk Bürosu)" value={form.yargiYeri.adi} onChange={(e) => setF(["yargiYeri", "adi"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                </div>
                {(type === "icra" || type === "delil_tanik") && (
                  <input placeholder="Dosya No" value={form.yargiYeri.dosyaNo} onChange={(e) => setF(["yargiYeri", "dosyaNo"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                )}
              </fieldset>

              {/* Kategoriye özel alanlar */}
              {type === "arabuluculuk" && (
                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-xs text-zinc-400">Başvuru Bilgileri</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input placeholder="Başvuru Tarihi (gg/aa/yyyy)" value={form.basvuru.tarih} onChange={(e) => setF(["basvuru", "tarih"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    <input placeholder="Konu (örn: işçilik alacağı / kira uyuşmazlığı …)" value={form.basvuru.konu} onChange={(e) => setF(["basvuru", "konu"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  </div>
                  <ArrayEditor label="Beyanlar" values={form.basvuru.beyanlar}
                    onAdd={() => setF(["basvuru", "beyanlar"], [...form.basvuru.beyanlar, ""])}
                    onRemove={(i) => setF(["basvuru", "beyanlar"], form.basvuru.beyanlar.filter((_: any, idx: number) => idx !== i))}
                    onChange={(i, v) => setF(["basvuru", "beyanlar", i], v)}
                  />
                  <ArrayEditor label="Talep Kalemleri" values={form.basvuru.kalemler}
                    onAdd={() => setF(["basvuru", "kalemler"], [...form.basvuru.kalemler, ""])}
                    onRemove={(i) => setF(["basvuru", "kalemler"], form.basvuru.kalemler.filter((_: any, idx: number) => idx !== i))}
                    onChange={(i, v) => setF(["basvuru", "kalemler", i], v)}
                  />
                </fieldset>
              )}

              {type === "icra" && (
                <>
                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Tebligat</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Tebliğ Tarihi (gg/aa/yyyy)" value={form.tebligat.tarih} onChange={(e) => setF(["tebligat", "tarih"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Tebliğ Şekli (PTT / muhtar / elden …)" value={form.tebligat.sekil} onChange={(e) => setF(["tebligat", "sekil"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>
                  </fieldset>

                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">İtirazlar</legend>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm">
                      {[
                        ["borca", "Borca"],
                        ["miktara", "Miktara"],
                        ["faize", "Faize"],
                        ["imzaya", "İmzaya"],
                        ["yetkiye", "Yetkiye"],
                      ].map(([key, label]) => (
                        <label key={key} className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={!!form.itiraz[key]} onChange={(e) => setF(["itiraz", key], e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </div>
                    {form.itiraz.yetkiye && (
                      <input placeholder="Yetkili icra dairesi/mahkeme" value={form.itiraz.yetkiliDaire} onChange={(e) => setF(["itiraz", "yetkiliDaire"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    )}
                    <textarea placeholder="Diğer itiraz gerekçeleri / olay özeti" rows={3} value={form.itiraz.diger} onChange={(e) => setF(["itiraz", "diger"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  </fieldset>

                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Açıklama</legend>
                    <textarea placeholder="Kısa özet" rows={3} value={form.aciklama} onChange={(e) => setF(["aciklama"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  </fieldset>
                </>
              )}

              {type === "delil_tanik" && (
                <>
                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Mahkeme Bilgisi</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Görev (Asliye Hukuk / Sulh Hukuk / İş vb.)" value={form.mahkeme.gorev} onChange={(e) => setF(["mahkeme", "gorev"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Dosya No" value={form.yargiYeri.dosyaNo} onChange={(e) => setF(["yargiYeri", "dosyaNo"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>
                  </fieldset>

                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Taraf Sıfatı</legend>
                    <div className="flex gap-3 text-sm">
                      {["davaci", "davali"].map((sif) => (
                        <label key={sif} className="inline-flex items-center gap-2">
                          <input type="radio" name="tarafSifati" checked={form.taraf.sifati === sif} onChange={() => setF(["taraf", "sifati"], sif)} />
                          {sif.toUpperCase()}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Vekil (varsa)</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input placeholder="Ad Soyad" value={form.vekil.adSoyad} onChange={(e) => setF(["vekil", "adSoyad"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Baro" value={form.vekil.baro} onChange={(e) => setF(["vekil", "baro"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Adres" value={form.vekil.adres} onChange={(e) => setF(["vekil", "adres"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>
                  </fieldset>

                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Tanıklar</legend>
                    {form.taniklar.map((t: any, i: number) => (
                      <div key={i} className="rounded-xl border border-white/10 p-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input placeholder="Ad Soyad" value={t.adSoyad} onChange={(e) => setF(["taniklar", i, "adSoyad"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                          <input placeholder="TC" value={t.tcVkn} onChange={(e) => setF(["taniklar", i, "tcVkn"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input placeholder="Telefon" value={t.telefon} onChange={(e) => setF(["taniklar", i, "telefon"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                          <input placeholder="Adres" value={t.adres} onChange={(e) => setF(["taniklar", i, "adres"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        </div>
                        <textarea placeholder="Hangi konuda dinlenecek?" rows={2} value={t.bilecekleri} onChange={(e) => setF(["taniklar", i, "bilecekleri"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        {form.taniklar.length > 1 && (
                          <button onClick={() => delRow(["taniklar"], i)} className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10">
                            Tanığı Kaldır
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addRow(["taniklar"], () => ({ adSoyad: "", tcVkn: "", telefon: "", adres: "", bilecekleri: "" }))} className="rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/10">
                      + Tanık Ekle
                    </button>
                  </fieldset>
                </>
              )}

              {type === "kira_tahliye" && (
                <>
                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Kira Sözleşmesi</legend>
                    <input placeholder="Kiralanan Taşınmazın Adresi" value={form.kira.adres} onChange={(e) => setF(["kira", "adres"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input placeholder="Cinsi (daire / işyeri …)" value={form.kira.cins} onChange={(e) => setF(["kira", "cins"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Kullanım Amacı (konut / ofis …)" value={form.kira.kullanimAmaci} onChange={(e) => setF(["kira", "kullanimAmaci"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Depozito (TL)" value={form.kira.depozito} onChange={(e) => setF(["kira", "depozito"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>

                    <div className="rounded-lg border border-white/10 p-3 space-y-2">
                      <div className="text-xs text-zinc-400">Kiraya Veren</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input placeholder="Ad Soyad" value={form.kira.kirayaVeren.adSoyad} onChange={(e) => setF(["kira", "kirayaVeren", "adSoyad"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        <input placeholder="TC/VKN" value={form.kira.kirayaVeren.tcVkn} onChange={(e) => setF(["kira", "kirayaVeren", "tcVkn"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        <input placeholder="Telefon" value={form.kira.kirayaVeren.telefon} onChange={(e) => setF(["kira", "kirayaVeren", "telefon"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        <input placeholder="Adres" value={form.kira.kirayaVeren.adres} onChange={(e) => setF(["kira", "kirayaVeren", "adres"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 p-3 space-y-2">
                      <div className="text-xs text-zinc-400">Kiracı</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input placeholder="Ad Soyad" value={form.kira.kiraci.adSoyad} onChange={(e) => setF(["kira", "kiraci", "adSoyad"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        <input placeholder="TC/VKN" value={form.kira.kiraci.tcVkn} onChange={(e) => setF(["kira", "kiraci", "tcVkn"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        <input placeholder="Telefon" value={form.kira.kiraci.telefon} onChange={(e) => setF(["kira", "kiraci", "telefon"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                        <input placeholder="Adres" value={form.kira.kiraci.adres} onChange={(e) => setF(["kira", "kiraci", "adres"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input placeholder="Aylık Kira (TL)" value={form.kira.aylikKira} onChange={(e) => setF(["kira", "aylikKira"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Yıllık Kira (TL)" value={form.kira.yillikKira} onChange={(e) => setF(["kira", "yillikKira"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Ödeme Günü (örn: her ayın 1’i)" value={form.kira.odemeGunu} onChange={(e) => setF(["kira", "odemeGunu"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input placeholder="Banka Adı" value={form.kira.bankaAdi} onChange={(e) => setF(["kira", "bankaAdi"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Hesap No" value={form.kira.hesapNo} onChange={(e) => setF(["kira", "hesapNo"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="IBAN" value={form.kira.iban} onChange={(e) => setF(["kira", "iban"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input placeholder="Başlangıç (gg/aa/yyyy)" value={form.kira.baslangic} onChange={(e) => setF(["kira", "baslangic"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Bitiş (gg/aa/yyyy)" value={form.kira.bitis} onChange={(e) => setF(["kira", "bitis"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Süre (ay/yıl)" value={form.kira.sure} onChange={(e) => setF(["kira", "sure"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>

                    <ArrayEditor
                      label="Özel Şart Maddeleri"
                      values={form.kira.ozelMaddeler}
                      onAdd={() => setF(["kira", "ozelMaddeler"], [...form.kira.ozelMaddeler, ""])}
                      onRemove={(i) => setF(["kira", "ozelMaddeler"], form.kira.ozelMaddeler.filter((_: any, idx: number) => idx !== i))}
                      onChange={(i, v) => setF(["kira", "ozelMaddeler", i], v)}
                    />
                    <ArrayEditor
                      label="Kiracıya Bırakılan Eşyalar"
                      values={form.kira.birakilanEsyalar}
                      onAdd={() => setF(["kira", "birakilanEsyalar"], [...form.kira.birakilanEsyalar, ""])}
                      onRemove={(i) => setF(["kira", "birakilanEsyalar"], form.kira.birakilanEsyalar.filter((_: any, idx: number) => idx !== i))}
                      onChange={(i, v) => setF(["kira", "birakilanEsyalar", i], v)}
                    />
                  </fieldset>

                  <fieldset className="grid gap-3">
                    <legend className="mb-1 text-xs text-zinc-400">Tahliye Taahhütnamesi (varsa)</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Tahliye Tarihi (gg/aa/yyyy)" value={form.tahliyeTaahhut.tahliyeTarihi} onChange={(e) => setF(["tahliyeTaahhut", "tahliyeTarihi"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                      <input placeholder="Taahhüt Tarihi (gg/aa/yyyy)" value={form.tahliyeTaahhut.taahhutTarihi} onChange={(e) => setF(["tahliyeTaahhut", "taahhutTarihi"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                    </div>
                  </fieldset>
                </>
              )}

              {/* Deliller / Talepler / Ek Bilgi */}
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs text-zinc-400">Deliller</legend>
                <ArrayEditor label="" values={form.deliller}
                  onAdd={() => setF(["deliller"], [...form.deliller, ""])}
                  onRemove={(i) => setF(["deliller"], form.deliller.filter((_: any, idx: number) => idx !== i))}
                  onChange={(i, v) => setF(["deliller", i], v)}
                />
              </fieldset>

              {type !== "delil_tanik" && (
                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-xs text-zinc-400">Talepler</legend>
                  <ArrayEditor label="" values={form.talepler}
                    onAdd={() => setF(["talepler"], [...form.talepler, ""])}
                    onRemove={(i) => setF(["talepler"], form.talepler.filter((_: any, idx: number) => idx !== i))}
                    onChange={(i, v) => setF(["talepler", i], v)}
                  />
                </fieldset>
              )}

              <fieldset className="grid gap-3">
                <legend className="mb-1 text-xs text-zinc-400">Ek Bilgi</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input placeholder="İBAN (varsa)" value={form.ekBilgi.iban} onChange={(e) => setF(["ekBilgi", "iban"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="Tarih (gg/aa/yyyy)" value={form.ekBilgi.tarih} onChange={(e) => setF(["ekBilgi", "tarih"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                  <input placeholder="Not" value={form.ekBilgi.notlar} onChange={(e) => setF(["ekBilgi", "notlar"], e.target.value)} className="rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5" />
                </div>
              </fieldset>

              <div className="flex justify-between">
                <button onClick={() => setStep(0)} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-white hover:bg-white/15">
                  Geri
                </button>
                <button disabled={loading} onClick={makeDraft} className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-zinc-200 disabled:opacity-60">
                  Taslak Oluştur
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Önizleme + otomatik render */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 p-4 bg-black/20">
                <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  {loading ? "Dilekçe hazırlanıyor…" : aiMeta.draftDocxUrl || aiMeta.draftPdfUrl ? "Dilekçe hazır." : "Önizleme hazır."}
                </div>
                <div className="flex gap-2">
                  {aiMeta.draftDocxUrl && (
                    <a className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10" href={aiMeta.draftDocxUrl} target="_blank" rel="noreferrer">
                      DOCX’i indir
                    </a>
                  )}
                  {aiMeta.draftPdfUrl && (
                    <a className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10" href={aiMeta.draftPdfUrl} target="_blank" rel="noreferrer">
                      PDF’i indir
                    </a>
                  )}
                  <button onClick={onClose} className="rounded-xl bg-white text-black px-4 py-2 font-semibold hover:bg-zinc-200">
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ---------------- küçük yardımcı bileşen ---------------- */
function ArrayEditor({
  label,
  values,
  onAdd,
  onRemove,
  onChange,
}: {
  label?: string;
  values: string[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {label && <div className="text-xs text-zinc-400">{label}</div>}
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={v}
            onChange={(e) => onChange(i, e.target.value)}
            className="flex-1 rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 border border-white/5"
            placeholder={`Madde ${i + 1}`}
          />
          <button onClick={() => onRemove(i)} className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10">
            Sil
          </button>
        </div>
      ))}
      <button onClick={onAdd} className="rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/10">
        + Ekle
      </button>
    </div>
  );
}
