// functions/src/ai.ts
import express, { Request, Response, NextFunction } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { cert, getApps, initializeApp, ServiceAccount } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import OpenAI from "openai";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────────────────────
// Secrets
// ─────────────────────────────────────────────────────────────
const FIREBASE_ADMIN_JSON_B64 = defineSecret("FIREBASE_ADMIN_JSON_B64");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// ─────────────────────────────────────────────────────────────
// Firebase Admin init (lazy)
// ─────────────────────────────────────────────────────────────
let Admin: { db: Firestore; FieldValue: typeof FieldValue } | null = null;

function ensureAdmin(b64FromParam?: string | null) {
  if (!Admin) {
    const b64 = (b64FromParam ?? undefined) || process.env.FIREBASE_ADMIN_JSON_B64 || "";
    if (!getApps().length) {
      if (!b64) throw new Error("FIREBASE_ADMIN_JSON_B64 secret is missing");
      const json = Buffer.from(b64, "base64").toString("utf8");
      const sa = JSON.parse(json) as ServiceAccount;
      // storageBucket belirtmek istersen .env’de STORAGE_BUCKET tanımlayabilirsin
      initializeApp({ credential: cert(sa) });
    }
    Admin = { db: getFirestore(), FieldValue };
  }
  return Admin!;
}

const purchaseRef = (id: string) => ensureAdmin().db.doc(`purchases/${id}`);

// ─────────────────────────────────────────────────────────────
// OpenAI init (lazy) — key yoksa null döner, mock’a düşeriz
// ─────────────────────────────────────────────────────────────
let openai: OpenAI | null = null;
function ensureOpenAI(apiKeyFromParam?: string | null) {
  const key = (apiKeyFromParam ?? undefined) || process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!openai) openai = new OpenAI({ apiKey: key });
  return openai;
}

// ─────────────────────────────────────────────────────────────
// Express App & yardımcılar
// ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "4mb" }));

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const asyncRoute =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function mustHave<T extends object>(req: Request, keys: (keyof T)[]) {
  const src = (req.body ?? {}) as any;
  for (const k of keys) if (src[k as string] == null) throw new Error(`Eksik alan: ${String(k)}`);
  return src as T;
}

// ─────────────────────────────────────────────────────────────
// Türler & mock taslak üretici
// ─────────────────────────────────────────────────────────────
type Category = "arabuluculuk" | "icra" | "delil_tanik" | "kira_tahliye" | string;

type DraftSections = {
  baslik: string;
  taraflar: string;      // satırlar \n ile
  konu: string;
  aciklamalar: string[]; // paragraflar
  hukuki_sebepler?: string[];
  deliller?: string[];
  sonuc_istem: string;
  ekler?: string[];
};

function asName(v: any) {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (v.ad || v.soyad) return `${v.ad ?? ""} ${v.soyad ?? ""}`.trim();
  return String(v);
}
function asTC(v: any) {
  return v ? `TC: ${String(v)}` : "";
}

function buildMockSections(category: Category, input: Record<string, any>): DraftSections {
  const davaci = input.davaci || input.basvuran || input.kirayaVeren || {};
  const davali = input.davali || input.karsiTaraf || input.kiraci || {};
  const mahkeme = input.mahkeme || input.icraDairesi || input.arabuluculukBurosu || "İLGİLİ MERCİ";
  const dosyaNo = input.dosyaNo ? `Dosya No: ${input.dosyaNo}` : "";
  const konuSatiri = input.konu || input.basvuruKonusu || input.talepKonu || "Dilekçe konusu";

  const baslik = `${mahkeme}`;
  const taraflar = [
    `Davacı/Başvuran: ${asName(davaci)} ${asTC(davaci.tc)}`.trim(),
    `Davalı/Karşı Taraf: ${asName(davali)} ${asTC(davali.tc)}`.trim(),
  ].join("\n");

  switch (category) {
    case "arabuluculuk":
      return {
        baslik,
        taraflar,
        konu: `Konu: ${konuSatiri} hakkında arabuluculuk başvurusu`,
        aciklamalar: [
          `Müvekkil ${asName(davaci)} ile karşı taraf ${asName(davali)} arasında ${input.iliskininTuru || "hukuki ilişki"} bulunmaktadır.`,
          `Uyuşmazlık; ${input.uyusmazlikOzet || "alacak/işçilik/kira vb."} konularında ortaya çıkmış olup, tarafların dostane şekilde çözüme ulaştırılması amacıyla arabuluculuk sürecinin başlatılması talep edilmektedir.`,
        ],
        hukuki_sebepler: ["6325 sayılı Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu", "İlgili mevzuat"],
        deliller: ["Sözleşmeler", "Yazışmalar", "Tanık beyanları", "Her türlü yasal delil"],
        sonuc_istem: "Arabuluculuk başvurumuzun kabulü ile taraflara arabulucu huzurunda görüşme davetiyesi çıkartılmasına karar verilmesini saygıyla talep ederiz.",
      };

    case "icra":
      return {
        baslik,
        taraflar,
        konu: `Konu: ${konuSatiri} (İcra takibine ilişkin beyan/itiraz)`,
        aciklamalar: [
          `${input.icraDairesi || "İcra Dairesi"} nezdinde ${dosyaNo} sayılı dosya ile tarafımıza tebliğ edilen ödeme emrine karşı itirazlarımızı sunmaktayız.`,
          `Borç kalemleri ve faiz hesaplamasında hukuka aykırılıklar mevcuttur. Özellikle ${input.itirazGerekcesi || "miktar/faiz/yetki/imza itirazları"} yönünden itiraz ediyoruz.`,
        ],
        hukuki_sebepler: ["2004 sayılı İcra ve İflas Kanunu", "TBK", "HMK"],
        deliller: ["Takip dosyası kapsamı", "Banka kayıtları", "Sözleşme", "Yazışmalar", "Her türlü delil"],
        sonuc_istem: "Belirtilen itirazlarımızın kabulü ile takibin durdurulmasına/iptaline karar verilmesini saygıyla talep ederiz.",
      };

    case "delil_tanik":
      return {
        baslik,
        taraflar,
        konu: `Konu: ${konuSatiri} (Delil ve tanık bildirme)`,
        aciklamalar: [
          `Sayın Mahkeme'nizde görülmekte olan dosyada iddia/def'ilerimizin ispatı amacıyla delillerimiz ve tanıklarımız bildirilmiştir.`,
          `Tanıklarımız; ${
            Array.isArray(input.taniklar) ? input.taniklar.map((t: any) => asName(t)).join(", ") : "…"
          } olup, her biri olayların gerçekleşme biçimini aydınlatacaktır.`,
        ],
        hukuki_sebepler: ["HMK", "İlgili mevzuat"],
        deliller: ["Tanık beyanları", "Yazışmalar", "Fatura/irsaliye vb.", "Her türlü delil"],
        sonuc_istem: "Bildirdiğimiz tanıkların davet edilerek dinlenmesine ve delillerimizin toplanmasına karar verilmesini saygıyla talep ederiz.",
      };

    case "kira_tahliye":
      return {
        baslik,
        taraflar,
        konu: `Konu: ${konuSatiri} (Kira ve tahliye talepleri)`,
        aciklamalar: [
          `${input.kiralananAdres || "Kiralanan taşınmaz"} adresindeki taşınmaz, ${asName(davaci)} tarafından ${asName(davali)}’ye kiralanmıştır.`,
          `Kira bedelinin ödenmemesi / tahliye taahhütnamesi / sözleşmeye aykırılık nedeniyle tahliye talep ediyoruz.`,
        ],
        hukuki_sebepler: ["TBK", "İlgili mevzuat"],
        deliller: ["Kira sözleşmesi", "Banka dekontları", "Tahliye taahhütnamesi", "Her türlü delil"],
        sonuc_istem: "Kiralananın tahliyesine ve kira alacaklarımızın tahsiline karar verilmesini saygıyla talep ederiz.",
      };

    default:
      return {
        baslik,
        taraflar,
        konu: `Konu: ${konuSatiri}`,
        aciklamalar: [
          "Olayların özeti bu bölüme gelecektir.",
          "Hukuki değerlendirme ve açıklamalar burada yer alacaktır."
        ],
        sonuc_istem: "Taleplerimizin kabulünü saygıyla arz ve talep ederiz."
      };
  }
}

// ─────────────────────────────────────────────────────────────
// /ai/start  → state=collecting
// ─────────────────────────────────────────────────────────────
app.post(
  "/start",
  asyncRoute(async (req, res) => {
    const { purchaseId, category } = mustHave<{ purchaseId: string; category: string }>(req, [
      "purchaseId",
      "category",
    ]);

    await purchaseRef(purchaseId).set(
      {
        status: "pending",
        meta: {
          ai: {
            state: "collecting",
            category,
            startedAt: ensureAdmin().FieldValue.serverTimestamp(),
          },
        },
        updatedAt: ensureAdmin().FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────────────────
// /ai/draft  → kategori + form cevapları → OpenAI (varsa) / Mock
// ─────────────────────────────────────────────────────────────
app.post(
  "/draft",
  asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    const purchaseId = body.purchaseId as string;
    const category = (body.category as Category) || (body.type as Category);
    const input = (body.input as Record<string, any>) || {};
    const reviewFeedback = (body.reviewFeedback as string) || null;

    if (!purchaseId) throw new Error("Eksik alan: purchaseId");
    if (!category) throw new Error("Eksik alan: category");

    let sections: DraftSections;
    const client = ensureOpenAI(OPENAI_API_KEY.value());

    if (client) {
      const system = `
Sen bir hukuk katibisin. Yalnızca JSON döndür.
Alanlar: 
- baslik (string), 
- taraflar (string, satır sonları için \\n kullan), 
- konu (string), 
- aciklamalar (string[]), 
- hukuki_sebepler (string[], opsiyonel), 
- deliller (string[], opsiyonel), 
- sonuc_istem (string), 
- ekler (string[], opsiyonel).
Türkçe ve resmi üslup kullan. JSON dışına çıkma.`;

      const userPayload = {
        category,
        input,
        reviewFeedback,
        note: "Sadece JSON nesnesi olarak yanıt ver.",
      };

      try {
        const chat = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(userPayload) }
          ],
        });

        const content = chat.choices?.[0]?.message?.content || "{}";
        sections = JSON.parse(content) as DraftSections;

        // zorunlu alanlar eksikse güvenli doldurma
        if (!sections.baslik) {
          sections.baslik = input.mahkeme || input.icraDairesi || input.arabuluculukBurosu || "İLGİLİ MERCİ";
        }
        if (!sections.konu) {
          sections.konu = `Konu: ${input.konu || input.basvuruKonusu || input.talepKonu || "Dilekçe"}`;
        }
        if (!sections.taraflar) {
          const davaci = input.davaci || input.basvuran || input.kirayaVeren || {};
          const davali = input.davali || input.karsiTaraf || input.kiraci || {};
          sections.taraflar = `Davacı/Başvuran: ${asName(davaci)}\nDavalı/Karşı Taraf: ${asName(davali)}`;
        }
        if (!sections.aciklamalar) sections.aciklamalar = [];
        if (!sections.sonuc_istem) sections.sonuc_istem = "Taleplerimizin kabulünü talep ederiz.";
      } catch (e) {
        console.error("[OpenAI JSON parse/response error]", e);
        sections = buildMockSections(category, input);
      }
    } else {
      // Key yoksa mock
      sections = buildMockSections(category, input);
    }

    // Firestore: state = in_progress + son taslak bilgileri
    const ref = purchaseRef(purchaseId);
    await ref.set(
      {
        meta: {
          ai: {
            state: "in_progress",
            category,
            lastDraftAt: ensureAdmin().FieldValue.serverTimestamp(),
            lastInput: input,
            lastReviewFeedback: reviewFeedback
          }
        },
        updatedAt: ensureAdmin().FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    res.json({ sections });
  })
);

// ─────────────────────────────────────────────────────────────
// /ai/render  → DOCX oluştur + Storage'a yükle + awaiting_review
// ─────────────────────────────────────────────────────────────
function draftToDoc(sections: DraftSections) {
  const children: Paragraph[] = [];

  // Başlık
  if (sections.baslik) {
    children.push(new Paragraph({ text: sections.baslik, heading: HeadingLevel.TITLE }));
  }

  // Taraflar
  if (sections.taraflar) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Taraflar", heading: HeadingLevel.HEADING_2 }),
      ...sections.taraflar.split("\n").map((line) => new Paragraph(line))
    );
  }

  // Konu
  if (sections.konu) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Konu", heading: HeadingLevel.HEADING_2 }),
      new Paragraph(sections.konu)
    );
  }

  // Açıklamalar
  if (sections.aciklamalar?.length) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Açıklamalar", heading: HeadingLevel.HEADING_2 }),
      ...sections.aciklamalar.map((p) => new Paragraph(p))
    );
  }

  // Hukuki Sebepler
  if (sections.hukuki_sebepler?.length) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Hukuki Sebepler", heading: HeadingLevel.HEADING_2 }),
      ...sections.hukuki_sebepler.map((p) => new Paragraph(p))
    );
  }

  // Deliller
  if (sections.deliller?.length) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Deliller", heading: HeadingLevel.HEADING_2 }),
      ...sections.deliller.map((p) => new Paragraph("• " + p))
    );
  }

  // Sonuç ve İstem
  if (sections.sonuc_istem) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Sonuç ve İstem", heading: HeadingLevel.HEADING_2 }),
      new Paragraph(sections.sonuc_istem)
    );
  }

  // Ekler
  if (sections.ekler?.length) {
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({ text: "Ekler", heading: HeadingLevel.HEADING_2 }),
      ...sections.ekler.map((p) => new Paragraph("• " + p))
    );
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

app.post(
  "/render",
  asyncRoute(async (req, res) => {
    const { purchaseId, sections } = mustHave<{ purchaseId: string; sections: DraftSections }>(req, [
      "purchaseId",
      "sections",
    ]);

    // 1) DOCX oluştur
    const buffer = await draftToDoc(sections);

    // 2) Storage'a yükle (Firebase download token ile)
    const storage = getStorage();
    const bucket = storage.bucket(process.env.STORAGE_BUCKET || undefined);
    const path = `purchases/${purchaseId}/ai/AI_Draft_${Date.now()}.docx`;
    const file = bucket.file(path);

    const token = randomUUID();

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        metadata: { firebaseStorageDownloadTokens: token }
      }
    });

    // Firebase download URL (imzalı URL yerine)
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      path
    )}?alt=media&token=${token}`;

    // 3) Firestore güncelle
    const ref = purchaseRef(purchaseId);
    await ref.set(
      {
        status: "in_progress",
        meta: {
          ai: {
            state: "awaiting_review",
            draftDocxUrl: downloadUrl,
            lastRenderAt: ensureAdmin().FieldValue.serverTimestamp(),
            firstSuccessAt: ensureAdmin().FieldValue.serverTimestamp(),
          },
        },
        updatedAt: ensureAdmin().FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({ docxUrl: downloadUrl });
  })
);
// ─────────────────────────────────────────────────────────────
// Error handler
// ─────────────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err?.message || "İşlem başarısız";
  console.error("[/ai ERROR]", msg, err?.stack || err);
  res.status(400).json({ error: msg });
});

// ─────────────────────────────────────────────────────────────
// CORS (onRequest seviyesinde kesin)
// ─────────────────────────────────────────────────────────────
const ALLOWED = new Set([
  "http://localhost:3000",
  process.env.SITE_ORIGIN || "" // prod domainini .env/.secrets'te ayarlayabilirsin
]);

function setCors(res: Response, origin?: string) {
  const allow = origin && ALLOWED.has(origin) ? origin : "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ─────────────────────────────────────────────────────────────
// Export (Functions v2 onRequest + secrets)
// ─────────────────────────────────────────────────────────────
export const ai = onRequest(
  { region: "europe-west1", cors: true, secrets: [FIREBASE_ADMIN_JSON_B64, OPENAI_API_KEY] },
  (req, res) => {
    // Secrets hazırla
    ensureAdmin(FIREBASE_ADMIN_JSON_B64.value());
    ensureOpenAI(OPENAI_API_KEY.value());

    // CORS
    setCors(res as any, req.headers.origin as string | undefined);
    if (req.method === "OPTIONS") return res.status(204).send("");

    return app(req as any, res as any);
  }
);
