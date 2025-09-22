// functions/src/ai.ts
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

/* ============================ Firebase init ============================ */
try { admin.initializeApp(); } catch {}
const db = admin.firestore();
const bucket = admin.storage().bucket();

/* ================================ Config =============================== */
const REGION = "europe-west1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

/* =============================== Express ============================== */
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

/* ============================== Utilities ============================= */
function getOpenAI(): OpenAI {
  const key =
    process.env.OPENAI_API_KEY ||
    (process as any).env?.OPENAI_APIKEY ||
    (process as any).env?.OPENAI_Key;
  if (!key) throw new Error("OPENAI_API_KEY tanımlı değil");
  return new OpenAI({ apiKey: key as string });
}

// Sadece izinli HTML etiketleri kalsın
const ALLOWED_TAGS = new Set([
  "h1","h2","p","ul","ol","li","strong","em","br","table","thead","tbody","tr","th","td"
]);
function sanitizeAllowedTags(html: string): string {
  if (!html) return "";
  // script/style/link kökten sil
  html = html.replace(/<\/?(script|style|link)[^>]*>/gi, "");
  // izinli olmayan tagları kaldır (içerikleri kalsın)
  return html.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (m, tag) =>
    ALLOWED_TAGS.has(String(tag).toLowerCase()) ? m : ""
  );
}

function tryParseJson<T = any>(s: string): T | null {
  try { return JSON.parse(s); } catch { return null; }
}

// Eski JSON taslak şemasından HTML’e koruma dönüşümü
function jsonDraftToHtml(obj: any): string {
  const baslik = obj?.baslik || "";
  const konu = obj?.konu || "";
  const aciklamalar: string[] = Array.isArray(obj?.aciklamalar) ? obj.aciklamalar : [];
  const hukuki: string[] = Array.isArray(obj?.hukuki_sebepler) ? obj.hukuki_sebepler : [];
  const deliller: string[] = Array.isArray(obj?.deliller) ? obj.deliller : [];
  const sonuc: any = obj?.sonuc_istem;

  let h = "";
  if (baslik) h += `<h1>${baslik}</h1>`;
  if (obj?.taraflar) {
    const t = obj.taraflar;
    if (t.basvuran) h += `<p><strong>Başvuran:</strong> ${t.basvuran}</p>`;
    const k = Array.isArray(t.karsiTaraflar) ? t.karsiTaraflar.join(", ") : (t.karsiTaraflar || "");
    if (k) h += `<p><strong>Karşı Taraf(lar):</strong> ${k}</p>`;
  }
  if (konu) h += `<p><strong>Konu:</strong> ${konu}</p>`;

  if (aciklamalar.length) h += `<ol>${aciklamalar.map((m)=>`<li>${m}</li>`).join("")}</ol>`;
  if (hukuki.length) h += `<h2>Hukuki Sebepler</h2><ul>${hukuki.map((m)=>`<li>${m}</li>`).join("")}</ul>`;
  if (deliller.length) h += `<h2>Deliller</h2><ul>${deliller.map((m)=>`<li>${m}</li>`).join("")}</ul>`;
  if (sonuc) {
    h += `<h2>Netice ve Talep</h2>`;
    if (Array.isArray(sonuc)) {
      h += `<ul>${sonuc.map((m)=>`<li>${m}</li>`).join("")}</ul>`;
    } else {
      h += `<p>${String(sonuc)}</p>`;
    }
  }
  h += `<p>Tarih: GG/AA/YYYY – İmza</p>`;
  return h;
}

/* ========================== LLM: HTML Üretimi ========================= */
async function llmHtmlBody(category: string, input_json: any): Promise<string> {
  const openai = getOpenAI();

  const SYSTEM_PROMPT = `SEN KİMSİN
- Türkiye’de pratik yapan kıdemli bir avukatsın.
- Sana "kategori" ve normalize edilmiş "input_json" verileri gelecek (kullanıcı formu).
- Görevin: Bu veriyi esas alarak TAM ve RESMÎ bir DİLEKÇE METNİ üretmek.

ÇIKTI BİÇİMİ (ÇOK ÖNEMLİ)
- ÇIKTIN SADECE YALIN HTML GÖVDESİ olsun (UTF-8).
- İzin verilen etiketler: <h1>, <h2>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <br>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- <style>, <script>, <link>, kod bloğu ve Markdown YASAK.
- Paragraflar için <p>; madde işaretleri için <ol>/<ul>-<li> kullan.
- Uydurma bilgi ekleme. Eksikse ilgili alanı atla veya kısa tut.

GENEL ŞABLON
- Üst başlık (h1): hitap makamı (mahkeme/büro).
- (Varsa) DOSYA NO satırı (kısa <p>).
- Taraf bilgileri (kısa <p> blokları).
- Konu satırı: “Konu: …” (kısa <p>).
- Açıklamalar: <ol> içinde kısa ve numaralı maddeler.
- Hukuki Sebepler: <ul> içinde ilgili kanun atıfları (kısaltmalar).
- Deliller: <ul> listesi (kısa).
- Netice ve Talep: <p> içinde bir-iki cümle + istenen hususlar için <ul> veya <ol>.
- Son satır: <p>“Tarih: GG/AA/YYYY – İmza</p>

KATEGORİYE ÖZGÜ KURALLAR
- "arabuluculuk":
  - Başlık: “… ARABULUCULUK BÜROSUNA”
  - Açıklamalar kısa ve maddeli olmalı.
  - Hukuki atıf: 6325 sayılı HUAK.
  - Taraflar: başvuran ve karşı taraf(lar) ayrı satırlarda.
- "icra":
  - Başlık: “… İCRA DAİRESİ MÜDÜRLÜĞÜNE”
  - Konu: “… İcra Dairesi …/… sayılı dosyaya itiraz” (dosya noyu input_json’dan al).
  - İtiraz türlerini açık söyle: borca/miktara/faize/yetkiye/imzaya (gelen verilere göre).
  - Hukuki atıf: İİK.
- "delil_tanik":
  - Başlık: “… ASLİYE/SULH/İŞ … MAHKEMESİ’NE” (input_json mahkeme adını kullan)
  - Tanıkları numaralandır; her tanık için adı ve “bilecekleri hususlar” kısa yaz.
  - Hukuki atıf: HMK.
- "kira_tahliye":
  - Başlık: ilgili Sulh Hukuk Mahkemesi.
  - Kira sözleşmesinin temel parametrelerini maddeler halinde yaz (adres, aylık kira, ödeme günü vs.).
  - Varsa tahliye taahhüdü tarihini ayrıca belirt.
  - Hukuki atıf: TBK.

ÜSLUP
- Resmî Türkçe.
- Kısa cümleler, net ve madde madde yapı.
- Kişisel verileri input_json’daki gibi kullan (maskeleme yapma).

TARİH BİÇİMİ
- GG/AA/YYYY.

Doğrulama/Temizlik
- Sadece izin verilen etiketleri kullan (başka etiket üretme).
- Boş alanlar geldiyse o bölümü kısa tut veya atla.
- JSON, Markdown, açıklama döndürme; SADECE HTML gövde döndür.`;

  const userMsg = `User:
category: ${category}
input_json:
${JSON.stringify(input_json, null, 2)}`;

  // OpenAI Responses API — düz metin bekliyoruz
  const r = await openai.responses.create({
    model: OPENAI_MODEL,
    input: userMsg,
    instructions: SYSTEM_PROMPT,
  });

  // metni çıkar
  const text =
    (r as any)?.output_text ??
    ((r as any)?.output || [])
      .map((it: any) => (it?.content || []).map((c: any) => c?.text?.value || "").join(""))
      .join("");

  let html = (text || "").trim();

  // Model eski alışkanlıkla JSON döndürürse → HTML’e çevir
  if (/^\s*[\{\[]/.test(html)) {
    const parsed = tryParseJson<any>(html);
    if (parsed) html = jsonDraftToHtml(parsed);
  }

  html = sanitizeAllowedTags(html).trim();
  if (!html) {
    html = `<h1>… MAKAMINA</h1><p>Konu: …</p><ol><li>…</li></ol><h2>Hukuki Sebepler</h2><ul><li>…</li></ul><h2>Deliller</h2><ul><li>…</li></ul><h2>Netice ve Talep</h2><p>…</p><p>Tarih: GG/AA/YYYY – İmza</p>`;
  }
  return html;
}

/* ============================== HTML → DOCX ============================== */
async function htmlToDocxBuffer(html: string): Promise<Buffer> {
  const mod = await import("html-to-docx");
  const HTMLtoDOCX = (mod as any).default || (mod as any);
  const buf: Uint8Array = await HTMLtoDOCX(
    `<html><head><meta charset="utf-8"></head><body>${html}</body></html>`,
    null,
    { table: { row: { cantSplit: true } } }
  );
  return Buffer.from(buf);
}

/* ============================== HTML → PDF =============================== */
async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const puppeteer = await (async () => {
    try { return (await import("puppeteer")).default; } catch { return null; }
  })();
  if (!puppeteer) throw new Error("PDF motoru yok (puppeteer kurulu değil)");
  const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(`<html><head><meta charset='utf-8'></head><body>${html}</body></html>`, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" }
  });
  await browser.close();
  return Buffer.from(pdf);
}

/* ============================== Storage Upload =========================== */
async function uploadBufferGetDownloadURL(
  buf: Buffer,
  contentType: string,
  objectPath: string
): Promise<string> {
  const file = bucket.file(objectPath);
  await file.save(buf, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000" } });
  // Public yapmak istemiyorsan makePublic kısmını kaldır veya imzalı URL üret.
  await file.makePublic().catch(() => {});
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(objectPath)}`;
}

/* ================================= Routes ================================ */

// POST /ai/start
app.post("/start", async (req, res) => {
  try {
    const { purchaseId, category } = req.body || {};
    if (!purchaseId || !category) return res.status(400).json({ error: "purchaseId ve category zorunlu" });

    await db.collection("purchases").doc(String(purchaseId)).set({
      meta: { ai: { state: "started", category, version: 0 } },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    logger.error("/ai/start error:", e);
    return res.status(500).json({ error: e?.message || "Başlatılamadı" });
  }
});

// POST /ai/draft  → LLM’den HTML üret ve sakla
// body: { purchaseId: string, category: string, input: any }
app.post("/draft", async (req, res) => {
  try {
    const { purchaseId, category, input } = req.body || {};
    if (!purchaseId || !category) return res.status(400).json({ error: "purchaseId ve category zorunlu" });

    const html = await llmHtmlBody(String(category), input);

    const pRef = db.collection("purchases").doc(String(purchaseId));
    const snap = await pRef.get();
    const curVer = Number(snap.data()?.meta?.ai?.version || 0);
    const nextVer = curVer + 1;

    await pRef.set({
      meta: { ai: { state: "drafted", category, version: nextVer, lastHtml: html } },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({ html, version: nextVer });
  } catch (e: any) {
    logger.error("/ai/draft error:", e);
    return res.status(500).json({ error: e?.message || "Önizleme oluşturulamadı" });
  }
});

// POST /ai/render → HTML’den DOCX (default) / PDF
// body: { purchaseId: string, html?: string, format?: 'docx' | 'pdf' }
app.post("/render", async (req, res) => {
  try {
    const { purchaseId, html: htmlBody, format = "docx" } = req.body || {};
    if (!purchaseId) return res.status(400).json({ error: "purchaseId zorunlu" });

    const pRef = db.collection("purchases").doc(String(purchaseId));
    const snap = await pRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Satın alma bulunamadı" });
    const data: any = snap.data();
    const category = data?.meta?.ai?.category || "arabuluculuk";
    const version = Number(data?.meta?.ai?.version || 1);

    const html = (typeof htmlBody === "string" && htmlBody.trim())
      ? sanitizeAllowedTags(htmlBody)
      : (data?.meta?.ai?.lastHtml || "");
    if (!html) return res.status(400).json({ error: "Önce önizleme (HTML) gerekli" });

    let url = "";
    if (format === "pdf") {
      const pdfBuf = await htmlToPdfBuffer(html);
      const objectPath = `ai/petitions/${purchaseId}/draft_v${version}.pdf`;
      url = await uploadBufferGetDownloadURL(pdfBuf, "application/pdf", objectPath);
      await pRef.set({
        meta: { ai: { state: "awaiting_review", category, version, draftPdfUrl: url, firstSuccessAt: admin.firestore.FieldValue.serverTimestamp() } },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      const docxBuf = await htmlToDocxBuffer(html);
      const objectPath = `ai/petitions/${purchaseId}/draft_v${version}.docx`;
      url = await uploadBufferGetDownloadURL(
        docxBuf,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        objectPath
      );
      await pRef.set({
        meta: { ai: { state: "awaiting_review", category, version, draftDocxUrl: url, firstSuccessAt: admin.firestore.FieldValue.serverTimestamp() } },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return res.status(200).json({ ok: true, url, format });
  } catch (e: any) {
    logger.error("/ai/render error:", e);
    return res.status(500).json({ error: e?.message || "Dilekçe oluşturulamadı" });
  }
});

/* ============================== Cloud Function ============================== */
export const ai = onRequest({ region: REGION, timeoutSeconds: 120 }, app as any);
