import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import Busboy from "busboy";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

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
const MAIL_FROM = defineString("MAIL_FROM");               // functions/.env (opsiyonel)

/* -------------------- Secrets (Secret Manager) -------------------- */
const IYZICO_API_KEY = defineSecret("IYZICO_API_KEY");
const IYZICO_SECRET  = defineSecret("IYZICO_SECRET");

const MAIL_HOST = defineSecret("MAIL_HOST");
const MAIL_PORT = defineSecret("MAIL_PORT");
const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");

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

/* -------------------- 4) Dilekçe yükleme (multipart) -------------------- */
app.post("/upload-petition", (req, res) => {
  try {
    const bb = Busboy({ headers: req.headers });
    let fileBuffer: Buffer | null = null;
    let fileName = "petition.pdf";
    let mime = "application/pdf";
    let purchaseId = "";

    bb.on("file", (_n, file, info) => {
      const chunks: Buffer[] = [];
      mime = info.mimeType || mime;
      fileName = info.filename || fileName;
      file.on("data", (d: Buffer) => chunks.push(d));
      file.on("end", () => (fileBuffer = Buffer.concat(chunks)));
    });

    bb.on("field", (name, val) => {
      if (name === "purchaseId") purchaseId = val;
    });

    bb.on("finish", async () => {
      try {
        if (!fileBuffer || !purchaseId) {
          res.status(400).json({ ok: false, error: "missing file or purchaseId" });
          return;
        }
        const path = `uploads/petitions/${purchaseId}/${Date.now()}-${fileName}`;
        const url = await saveToStorageAndGetUrl(fileBuffer!, mime, path);

        await db.collection("purchases").doc(purchaseId).set(
          {
            petitionUrl: url,
            petitionPath: path,
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

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

/* -------------------- 5) E-posta gönderme -------------------- */
app.post("/sendEmail", async (req, res) => {
  try {
    const { to, subject, html, attachments } = req.body || {};
    if (!to || !subject || !html) {
      res.status(400).json({ ok: false, error: "Eksik alan" });
      return;
    }

    const host = MAIL_HOST.value();
    const port = Number(MAIL_PORT.value());
    const user = MAIL_USER.value();
    const pass = MAIL_PASS.value();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: MAIL_FROM.value() || user,
      to,
      subject,
      html,
      attachments: (attachments || []).map((a: any) => ({
        filename: a.filename,
        path: a.url, // Storage public URL
      })),
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* -------------------- Export (v2) -------------------- */
export const api = onRequest(
  {
    region: "europe-west1",
    cors: true,
    secrets: [IYZICO_API_KEY, IYZICO_SECRET, MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS],
  },
  (req, res) => app(req, res)
);
