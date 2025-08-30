import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import Busboy from "busboy";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import multer from "multer";
// v2 Functions + .env / Secrets
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";



// Üste bir yardımcı ekleyin (dosyanın başına da koyabilirsiniz)
function iyziDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}-${m}-${day} ${h}:${min}:${s}`; // İyziCo'nun beklediği format
}







/* -------------------- Params (dotenv) -------------------- */

        
const STORAGE_BUCKET = defineString("STORAGE_BUCKET");     // functions/.env
              // functions/.env (opsiyonel)

/* -------------------- Secrets (Secret Manager) -------------------- */
const IYZICO_API_KEY = defineSecret("IYZICO_API_KEY");
const IYZICO_SECRET  = defineSecret("IYZICO_SECRET");

const MAIL_HOST = defineSecret("MAIL_HOST");
const MAIL_PORT = defineSecret("MAIL_PORT");
const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");
const MAIL_FROM = defineSecret("MAIL_FROM");

/* -------------------- Firebase Admin -------------------- */
/** ❗ Modül yüklenirken param değerlerini okumuyoruz. */
if (admin.apps.length === 0) {
  // Varsayılan proje bilgileriyle başlat (bucket'ı runtime'da alacağız)
  admin.initializeApp();
}
const db = admin.firestore();




/** Bucket erişimini runtime'da yapalım */
function getBucket() {
  const name = STORAGE_BUCKET.value();
  return name ? admin.storage().bucket(name) : admin.storage().bucket();
}

/* -------------------- Express App + CORS -------------------- */
const app = express();
// En kolay CORS: tüm origin'lere izin. İstersen origin: SITE_ORIGIN.value()
app.use(cors({ origin: true }));
app.options(/.*/, cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* -------------------- Helpers -------------------- */
async function saveToStorageAndGetUrl(
  buffer: Buffer,
  contentType: string,
  path: string
) {
  const token = uuidv4();
  const bucket = getBucket();
  await bucket.file(path).save(buffer, {
    contentType,
    metadata: {
      metadata: { firebaseStorageDownloadTokens: token },
      cacheControl: "public,max-age=31536000",
    },
    resumable: false,
  });
  const bucketName = bucket.name;
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

/* -------------------- 1) Ödeme başlatma (Iyzico Checkout Form) -------------------- */
// ▶ /createSession — purchases yerine paymentIntents aç
app.post("/createSession", async (req, res): Promise<void> => {
  try {
    const { userId, email, productKey, productType, price, name, returnBase } = req.body || {};
    if (!userId || !email || !productKey || !price) {
      res.status(400).json({ ok: false, error: "Eksik alan" });
      return;
    }

    // ✅ paymentIntents dokümanı aç
    const intentRef = db.collection("paymentIntents").doc();
    await intentRef.set({
      userId,
      email,
      name: name ?? null,
      productKey,                  // "dilekce" | "uzman" | "gorusme"
      productType: productType ?? productKey,
      type: productKey,            // eski kodun 'type' alanı ile uyum
      price,
      status: "initiated",         // initiated | paid | failed
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Iyzipay client
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Iyzipay = require("iyzipay");
    const iyzipay = new Iyzipay({
      apiKey: IYZICO_API_KEY.value(),
      secretKey: IYZICO_SECRET.value(),
      uri: "https://sandbox-api.iyzipay.com", // PROD: https://api.iyzipay.com
    });

    // Functions base + rb
    const projectId     = process.env.GCLOUD_PROJECT || "dilekce-destek";
    const functionsBase = `https://europe-west1-${projectId}.cloudfunctions.net/api`;
    const rb = (returnBase && typeof returnBase === "string") ? returnBase : "";

    // 🔴 callback ve basketId intentId ile çalışır (rb encode edildi!)
    const callbackUrl = rb
      ? `${functionsBase}/paymentCallback?pid=${intentRef.id}&rb=${encodeURIComponent(rb)}`
      : `${functionsBase}/paymentCallback?pid=${intentRef.id}`;

    const paidPrice = Number(price).toFixed(2);
    const request = {
      locale: "tr",
      conversationId: intentRef.id,     // intentId
      price: paidPrice,
      paidPrice: paidPrice,
      currency: "TRY",
      installment: "1",
      basketId: intentRef.id,           // intentId
      paymentGroup: "PRODUCT",
      callbackUrl,
      buyer: {
        id: userId,
        name: name || "Müşteri",
        surname: "—",
        gsmNumber: "+900000000000",
        email,
        identityNumber: "11111111111",
        lastLoginDate: iyziDate(new Date()),
        registrationDate: iyziDate(new Date()),
        registrationAddress: "—",
        ip: "85.34.78.112",
        city: "—",
        country: "TR",
        zipCode: "—",
      },
      billingAddress: {
        contactName: name || "Müşteri",
        city: "—",
        country: "TR",
        address: "—",
        zipCode: "—",
      },
      shippingAddress: {
        contactName: name || "Müşteri",
        city: "—",
        country: "TR",
        address: "—",
        zipCode: "—",
      },
      basketItems: [
        {
          id: productKey,
          name: productType || productKey,
          category1: "legal",
          itemType: "VIRTUAL",
          price: paidPrice,
        },
      ],
    };

    // Init et
    const initResult: any = await new Promise((resolve, reject) => {
      iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    // intent + token
    await intentRef.set(
      {
        iyzico: {
          initRaw: initResult ?? null,
          conversationId: initResult?.conversationId ?? null,
          token: initResult?.token ?? null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (initResult?.token) {
      await db.collection("iyzi_tokens").doc(String(initResult.token)).set(
        {
          intentId: intentRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Response
    if (initResult?.checkoutFormContent) {
      res.status(200).json({
        ok: true,
        mode: "embedded",
        checkoutFormContent: initResult.checkoutFormContent,
        purchaseId: intentRef.id,  // = intentId
        intentId: intentRef.id,
        returnBack: !!rb,
      });
      return;
    }

    if (initResult?.paymentPageUrl || initResult?.payWithIyzicoPageUrl) {
      res.status(200).json({
        ok: true,
        mode: "redirect",
        paymentPageUrl: initResult.paymentPageUrl || initResult.payWithIyzicoPageUrl,
        purchaseId: intentRef.id,  // = intentId
        intentId: intentRef.id,
        returnBack: !!rb,
      });
      return;
    }

    console.error("createSession: Ödeme sayfası dönmedi", initResult);
    res.status(500).json({ ok: false, error: "Ödeme sayfası oluşturulamadı" });
  } catch (e: any) {
    console.error("createSession exception:", e);
    res.status(500).json({ ok: false, error: "Sunucu hatası" });
  }
});





/* -------------------- 2) Ödeme callback (retrieve + redirect) -------------------- */
app.all("/paymentCallback", async (req, res): Promise<void> => {
  try {
    // Token: POST (urlencoded) veya GET
    const token =
      (req.body && (req.body.token || req.body.Token)) ||
      (req.query && (req.query.token as string));
    const pidFromQuery = (req.query && (req.query.pid as string)) || "";

    // ✅ FRONTEND origin (rb) — yoksa ENV — yoksa localhost
    const rbQuery = (req.query && (req.query.rb as string)) || "";
    const baseUrl =
      rbQuery ||
      process.env.SITE_ORIGIN ||
      process.env.FRONTEND_ORIGIN ||
      "http://localhost:3000";

    if (!token && !pidFromQuery) {
      res.redirect(303, `${baseUrl}/failed`);
      return;
    }

    // Iyzipay client
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Iyzipay = require("iyzipay");
    const iyzipay = new Iyzipay({
      apiKey: IYZICO_API_KEY.value(),
      secretKey: IYZICO_SECRET.value(),
      uri: "https://sandbox-api.iyzipay.com", // PROD: https://api.iyzipay.com
    });

    const retrieveResult: any = await new Promise((resolve, reject) => {
      iyzipay.checkoutForm.retrieve({ locale: "tr", token }, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    const paymentStatus = (retrieveResult?.paymentStatus || "").toUpperCase();
    const success = paymentStatus === "SUCCESS";

    // intentId bul: 1) query pid 2) basketId 3) token map
    let intentId: string =
      pidFromQuery ||
      retrieveResult?.basketId ||
      retrieveResult?.basketID ||
      "";

    if (!intentId && token) {
      const tokenDoc = await db.collection("iyzi_tokens").doc(String(token)).get();
      intentId = (tokenDoc.exists && (tokenDoc.data()?.intentId as string)) || "";
    }

    if (!intentId) {
      console.warn("paymentCallback: intentId bulunamadı.");
      res.redirect(303, `${baseUrl}/failed`);
      return;
    }

    // intent güncelle (paid/failed + raw)
    const intentRef = db.collection("paymentIntents").doc(intentId);
    const intentSnap = await intentRef.get();
    const intentData = intentSnap.exists ? (intentSnap.data() || {}) : {};

    await intentRef.set(
      {
        status: success ? "paid" : "failed",
        iyzico: {
          ...(intentData.iyzico || {}),
          retrieveRaw: retrieveResult ?? null,
          token: token ?? intentData?.iyzico?.token ?? null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!success) {
      // ❌ Başarısız/iptal → FRONTEND failed
      res.redirect(303, `${baseUrl}/failed`);
      return;
    }

    // ✅ Başarılı: YENİ purchase oluştur
    const purchaseRef = await db.collection("purchases").add({
      userId: intentData.userId,
      email: intentData.email,
      type: intentData.productType ?? intentData.productKey, // UI etiketi
      productKey: intentData.productKey,
      price: intentData.price,
      paymentStatus: "paid",
      status: "hazırlanıyor",                  // TESLİMAT sizde tamamlanınca değişecek
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      intentId,
    });

    // (Opsiyonel) Token map’i temizle
    if (token) {
      try { await db.collection("iyzi_tokens").doc(String(token)).delete(); } catch {}
    }

    // (Opsiyonel) Görüşme/Uzman için chatTickets
    try {
      const key = String(intentData.productKey || "").toLowerCase();
      if (key === "gorusme" || key === "uzman") {
        await admin.database().ref(`chatTickets/${purchaseRef.id}`).set({
          userId: String(intentData.userId),
          purchaseId: purchaseRef.id,
          type: key,
          status: "open", // open -> active -> closed
          assignedLawyer: null,
          createdAt: Date.now(),
        });
      }
    } catch (rtErr) {
      console.warn("paymentCallback: chatTickets yazılamadı:", rtErr);
    }

    // ✅ Başarı yönlendirmesi → FRONTEND **/success**
    res.redirect(303, `${baseUrl}/success?pid=${purchaseRef.id}`);
    return;
  } catch (e: any) {
    console.error("paymentCallback exception:", e);
    const rbQuery = (req.query && (req.query.rb as string)) || "";
    const baseUrl =
      rbQuery ||
      process.env.SITE_ORIGIN ||
      process.env.FRONTEND_ORIGIN ||
      "http://localhost:3000";
    res.redirect(303, `${baseUrl}/failed`);
    return;
  }
});




/* -------------------- 3) Blog kapak yükleme (multipart) -------------------- */
app.post("/blogUpload", (req, res) => {
  try {
    const bb = Busboy({ headers: req.headers });
    let fileBuffer: Buffer | null = null;
    let fileName = "upload.bin";
    let mime = "application/octet-stream";
    let targetDir = "uploads/blog/covers";

    bb.on("file", (_name, file, info) => {
      const chunks: Buffer[] = [];
      mime = info.mimeType || mime;
      fileName = info.filename || fileName;
      file.on("data", (d: Buffer) => chunks.push(d));
      file.on("end", () => (fileBuffer = Buffer.concat(chunks)));
    });

    bb.on("field", (name, val) => {
      if (name === "dir" && val) targetDir = val;
    });

    bb.on("finish", async () => {
      try {
        if (!fileBuffer) {
          res.status(400).json({ ok: false, error: "no file" });
          return;
        }
        const path = `${targetDir}/${Date.now()}-${uuidv4()}-${fileName}`;
        const url = await saveToStorageAndGetUrl(fileBuffer!, mime, path);
        res.json({ ok: true, url, path });
      } catch (e: any) {
        console.error(e);
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    });

    req.pipe(bb);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});



/* -------------------- Dilekçe yükleme (multipart + raw) -------------------- */

const uploadCors = cors({ origin: true });

// --- RAW PDF için body-parser ---
const rawPdf = express.raw({
  type: (req) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    return ct.startsWith("application/pdf") || ct.startsWith("application/octet-stream");
  },
  limit: "25mb",
});

// --- Multer (sadece multipart için) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("Sadece PDF kabul edilir"));
    cb(null, true);
  },
});

// Ortak yardımcılar
function corsHeaders(req: any, res: any) {
  // route-level CORS’u garantiye al (preflight dışı yanıtlarda da olsun)
  const origin = req.headers.origin || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin"); // CDN/proxy için
}

function bad(req: any, res: any, code: number, msg: string) {
  corsHeaders(req, res);
  res.status(code).json({ ok: false, error: msg });
  return;
}

async function authUid(req: any, res: any) {
  const h = req.get("authorization") || req.get("Authorization");
  if (!h || !h.startsWith("Bearer ")) return bad(req, res, 401, "Yetki yok (Bearer token gerekli)"), null;
  try { return (await admin.auth().verifyIdToken(h.split(" ")[1]!)).uid as string; }
  catch { return bad(req, res, 401, "Geçersiz token"), null; }
}

// 🔁 SABİT YOL + ÜZERİNE YAZMA: petitions/<purchaseId>.pdf
async function writePurchaseAfterUpload(
  purchaseId: string,
  uid: string,
  _fileName: string,          // gelen ad artık önemsenmiyor
  buffer: Buffer,
  req: any,
  res: any
) {
  // purchase + yetki
  const pRef = db.collection("purchases").doc(purchaseId);
  const pSnap = await pRef.get();
  if (!pSnap.exists) return bad(req, res, 404, "Sipariş bulunamadı");
  const pData = pSnap.data() || {};
  if (pData.assignedLawyerId && pData.assignedLawyerId !== uid) return bad(req, res, 403, "Bu sipariş size atanmamış");

  // hedef yol: /petitions/<purchaseId>.pdf (ALT KLASÖR YOK)
  const path = `petitions/${purchaseId}.pdf`;

  // önce aynı path’teki dosyayı sil (varsa) → tamamen "üzerine yaz" davranışı
  try {
    await getBucket().file(path).delete({ ignoreNotFound: true });
  } catch (e) {
    console.warn("[upload-petition] eski dosya silinemedi (devam):", e);
  }

  // yeni dosyayı yaz ve token’lı URL oluştur
  const token = uuidv4();
  await getBucket().file(path).save(buffer, {
    contentType: "application/pdf",
    metadata: {
      metadata: { firebaseStorageDownloadTokens: token },
      cacheControl: "public,max-age=31536000",
    },
    resumable: false,
  });
  const bucketName = getBucket().name;
  const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;

  // purchase güncelle
  const updates: Record<string, any> = {
    deliveredPdfUrl: pdfUrl,
    deliveredPdfPath: path,   // sabit yol
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!pData.assignedLawyerId) updates.assignedLawyerId = uid;
  if (!pData.status || pData.status === "pending" || pData.status === "hazırlanıyor") updates.status = "in_progress";
  await pRef.set(updates, { merge: true });

  corsHeaders(req, res);
  res.status(200).json({ ok: true, pdfUrl });
  return;
}

// === Birleşik endpoint ===
app.options("/upload-petition", uploadCors); // preflight

app.post(
  "/upload-petition",
  uploadCors,

  // 1) RAW PDF yolu (express.raw ile)
  (req, res, next) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("application/pdf") || ct.startsWith("application/octet-stream")) {
      return rawPdf(req, res, async () => {
        try {
          const uid = await authUid(req, res); if (!uid) return;
          const purchaseId = String((req.query?.purchaseId || req.body?.purchaseId || "")).trim();
          if (!purchaseId) return bad(req, res, 400, "purchaseId eksik");

          const buf: Buffer = req.body as Buffer;
          if (!buf || !buf.length) return bad(req, res, 400, "Boş dosya");

          await writePurchaseAfterUpload(purchaseId, uid, `${purchaseId}.pdf`, buf, req, res);
        } catch (e: any) {
          console.error("[upload-petition raw] error:", e);
          return bad(req, res, 500, e?.message || "Sunucu hatası");
        }
      });
    }
    return next(); // multipart’a geç
  },

  // 2) Multipart yolu (Multer ile)
  (req, res, next): void => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (!ct.includes("multipart/form-data")) {
      bad(req, res, 415, "Yanlış Content-Type. RAW PDF veya FormData kullanın.");
      return;
    }
    return next();
  },

  (req, res, next): void => {
    upload.single("file")(req, res, (err: any) => {
      if (!err) return next();
      const msg = err?.message || (err?.code === "LIMIT_FILE_SIZE" ? "Dosya 25MB sınırını aştı" : "Yükleme hatası");
      return bad(req, res, 400, msg);
    });
  },

  async (req, res): Promise<void> => {
    try {
      const uid = await authUid(req, res); if (!uid) return;
      const purchaseId = String(req.body?.purchaseId || "").trim();
      const file = req.file as Express.Multer.File | undefined;
      if (!purchaseId) return bad(req, res, 400, "purchaseId eksik");
      if (!file) return bad(req, res, 400, "PDF dosyası bulunamadı");
      if (file.mimetype !== "application/pdf") return bad(req, res, 400, "Sadece PDF kabul edilir");

      await writePurchaseAfterUpload(purchaseId, uid, `${purchaseId}.pdf`, file.buffer, req, res);
      return;
    } catch (err: any) {
      console.error("[upload-petition multipart] error:", err);
      return bad(req, res, 500, err?.message || "Sunucu hatası");
    }
  }
);

/* -------------------- 5) E-posta gönderme -------------------- */
// En üstlerde mevcut: import nodemailer from "nodemailer";
// const MAIL_HOST = defineSecret("MAIL_HOST"); ... vs

app.post("/sendEmail", async (req, res): Promise<void> => {
  try {
    const { to, subject, html, text, attachments } = req.body || {};

    if (!to || !subject || (!html && !text)) {
      res.status(400).json({ ok: false, error: "Eksik alan (to/subject/body)" });
      return;
    }

    // Secrets -> transporter
    const host = MAIL_HOST.value();
    const portNum = Number(MAIL_PORT.value() || 465);
    const user = MAIL_USER.value();
    const pass = MAIL_PASS.value();

    if (!host || !user || !pass) {
      res.status(500).json({ ok: false, error: "Mail secret'leri eksik" });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: portNum === 465,        // 465 -> SSL, 587 -> STARTTLS
      auth: { user, pass },
      // requireTLS: portNum === 587, // 587 kullanıyorsan açabilirsin
    });

    // (Opsiyonel) bağlantıyı doğrula — log’a yazar
    try { await transporter.verify(); } catch (e) { console.warn("SMTP verify:", e); }

    const fromAddr = MAIL_FROM.value() || user;
    const info = await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      html,
      text,
      // attachments formatı: [{ filename, path | content | href | url }]
      attachments: Array.isArray(attachments) ? attachments : undefined,
    });

    res.status(200).json({ ok: true, messageId: info?.messageId || null });
    return;
  } catch (e: any) {
    console.error("/sendEmail error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Sunucu hatası" });
    return;
  }
});


/* -------------------- Export (v2) -------------------- */
export const api = onRequest(
  {
    region: "europe-west1",
    cors: true,
    secrets: [IYZICO_API_KEY, IYZICO_SECRET, MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM],
  },
  (req, res) => app(req, res)
);
