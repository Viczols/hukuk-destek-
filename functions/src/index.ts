import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import Busboy from "busboy";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

// v2 Functions + .env / Secrets
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";

/* -------------------- Params (dotenv) -------------------- */

const SITE_ORIGIN   = defineString("SITE_ORIGIN");        
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
app.post("/createSession", async (req, res): Promise<void> => {
  try {
    const { userId, email, productKey, productType, price, name, returnBase } = req.body || {};
    if (!userId || !email || !productKey || !price) {
      res.status(400).json({ ok: false, error: "Eksik alan" });
      return;
    }

    // 1) Satın alma kaydı — eski şemaya uyumlu
    const purchaseRef = db.collection("purchases").doc();
    await purchaseRef.set({
      userId,
      email,
      productKey,                  // "dilekce" | "uzman" | "gorusme"
      productType,                 // "Dilekçe Paketi" vb.
      type: productKey,            // eski kodun 'type' alanı
      price,                       // number
      status: "hazırlanıyor",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      date: admin.firestore.FieldValue.serverTimestamp(), // eski şemanın 'date' alanı
    });

    // 2) Iyzico Checkout Form init
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Iyzipay = require("iyzipay");
    const iyzipay = new Iyzipay({
      apiKey: IYZICO_API_KEY.value(),
      secretKey: IYZICO_SECRET.value(),
      uri: "https://sandbox-api.iyzipay.com", // PROD: https://api.iyzipay.com
    });

    const projectId     = process.env.GCLOUD_PROJECT || "dilekce-destek";
    const functionsBase = `https://europe-west1-${projectId}.cloudfunctions.net/api`;

    // returnBase geldiyse callback'e ekliyoruz (yerelde localhost'a dönebilmek için)
    const rb = typeof returnBase === "string" ? encodeURIComponent(returnBase) : "";
    const callbackUrl = rb
      ? `${functionsBase}/paymentCallback?pid=${purchaseRef.id}&rb=${rb}`
      : `${functionsBase}/paymentCallback?pid=${purchaseRef.id}`;

    const paidPrice = Number(price).toFixed(2);
    const request = {
      locale: "tr",
      price: paidPrice,
      paidPrice: paidPrice,
      currency: "TRY",
      basketId: purchaseRef.id, // bizim purchaseId
      paymentGroup: "PRODUCT",
      callbackUrl,
      buyer: {
        id: userId,
        name: name || (email?.split("@")[0] ?? "Kullanici"),
        surname: "-",
        gsmNumber: "+905350000000",
        email,
        identityNumber: "11111111111",
        lastLoginDate: new Date().toISOString().slice(0,19).replace("T"," "),
        registrationDate: new Date().toISOString().slice(0,19).replace("T"," "),
        registrationAddress: "Adres",
        ip: "85.34.78.112",
        city: "Istanbul",
        country: "Turkey",
        zipCode: "34000",
      },
      shippingAddress: {
        contactName: name || "Kullanici",
        city: "Istanbul",
        country: "Turkey",
        address: "Adres",
        zipCode: "34000",
      },
      billingAddress: {
        contactName: name || "Kullanici",
        city: "Istanbul",
        country: "Turkey",
        address: "Adres",
        zipCode: "34000",
      },
      basketItems: [
        {
          id: productKey,
          name: productKey === "uzman" ? "Uzman Destekli Dilekçe" : "Dilekçe",
          category1: "Hizmet",
          itemType: "VIRTUAL",
          price: paidPrice,
        },
      ],
      enabledInstallments: [1],
      forceThreeDS: 0,
    };

    const initResult: any = await new Promise((resolve, reject) => {
      iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    // 2.1 Token'ı dokümana yaz + token map (yedek)
    const initToken = initResult?.token || null;
    if (initToken) {
      await purchaseRef.set({ token: String(initToken) }, { merge: true });
      await db.collection("iyzi_tokens").doc(String(initToken)).set({
        purchaseId: purchaseRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 2.2 Masaüstü dostu HTML wrapper (checkoutFormContent dar görünmesin)
    const wrapFullHtml = (snippet: string) => `
<!doctype html><html lang="tr"><head>
<meta charset="utf-8"><title>Ödeme</title><meta http-equiv="X-UA-Compatible" content="IE=edge" />
<style>
  html,body {height:100%; margin:0; background:#f6f7fb;}
  .container {min-height:100%; display:flex; align-items:center; justify-content:center; padding:24px;}
  .wrap { width:100%; max-width: 960px; background:#fff; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.06); padding:16px; }
</style>
</head><body><div class="container"><div class="wrap">${snippet}</div></div></body></html>`;

    // 2.3 Yanıt dalları
    if (initResult?.checkoutFormContent) {
      await purchaseRef.set(
        { iyzi: { conversationId: initResult?.conversationId || null, initRaw: initResult } },
        { merge: true }
      );
      res.json({ ok: true, html: wrapFullHtml(initResult.checkoutFormContent), purchaseId: purchaseRef.id });
      return;
    }

    if (initResult?.paymentPageUrl || initResult?.payWithIyzicoPageUrl) {
      await purchaseRef.set(
        { iyzi: { conversationId: initResult?.conversationId || null, initRaw: initResult } },
        { merge: true }
      );
      res.json({
        ok: true,
        paymentPageUrl: initResult.paymentPageUrl || initResult.payWithIyzicoPageUrl,
        purchaseId: purchaseRef.id,
      });
      return;
    }

    res.status(400).json({ ok: false, error: initResult?.errorMessage || "Iyzico init başarısız", raw: initResult });
    return;
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
    return;
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
    const rbFromQuery  = (req.query && (req.query.rb as string)) || ""; // returnBase

    if (!token) {
      console.error("callback: missing token", { body: req.body, query: req.query });
      res.status(400).send("missing token");
      return;
    }

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

    // purchaseId bul: 1) pid 2) basketId 3) token map
    let purchaseId: string =
      pidFromQuery ||
      retrieveResult?.basketId ||
      retrieveResult?.basketID ||
      "";
    if (!purchaseId) {
      const tokenDoc = await db.collection("iyzi_tokens").doc(String(token)).get();
      purchaseId = (tokenDoc.exists && (tokenDoc.data()?.purchaseId as string)) || "";
    }

    console.log("callback retrieve", {
      paymentStatus,
      purchaseId,
      hasPaidPrice: !!retrieveResult?.paidPrice,
    });

    if (purchaseId) {
      const paymentId =
        retrieveResult?.paymentId ||
        retrieveResult?.paymentID ||
        retrieveResult?.payment_id ||
        null;

      // Eski şemaya uygun güncelleme
      const updatePayload: any = {
        status: success ? "hazırlanıyor" : "başarısız",
        paymentId: paymentId || undefined,                 // string
        token: token ? String(token) : undefined,          // eski şema alanı
        date: admin.firestore.FieldValue.serverTimestamp(),// sonuç zamanı
        // debug/modern alanlar (istersen tut)
        paidPrice: retrieveResult?.paidPrice ? Number(retrieveResult.paidPrice) : undefined,
        iyzi: { retrieveRaw: retrieveResult, token },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      try {
        await db.collection("purchases").doc(purchaseId).set(updatePayload, { merge: true });
        const snap = await db.collection("purchases").doc(purchaseId).get();
        console.log("⚙️ Firestore write OK", {
          docId: purchaseId,
          exists: snap.exists,
          storedStatus: snap.exists ? snap.data()?.status : null,
        });
      } catch (err: any) {
        console.error("❌ Firestore write FAILED", { purchaseId, error: String(err) });
      }
    } else {
      console.warn("callback: purchaseId not found", {
        pidFromQuery,
        basketId: retrieveResult?.basketId,
        token,
      });
    }

    // Redirect base: öncelik returnBase (rb), yoksa SITE_ORIGIN
    const decodedRb = rbFromQuery ? decodeURIComponent(rbFromQuery) : "";
    const baseRaw =
      decodedRb ||
      SITE_ORIGIN.value() ||
      `https://${process.env.GCLOUD_PROJECT || "dilekce-destek"}.web.app`;
    const base = baseRaw.replace(/\/+$/, ""); // sondaki /'ları sil

    const tail = purchaseId ? `?pid=${encodeURIComponent(purchaseId)}` : "";
    const redirectUrl = success ? `${base}/success${tail}` : `${base}/failed${tail}`;

    res
      .status(200)
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting</title><meta http-equiv="refresh" content="0;url=${redirectUrl}"></head><body><script>location.replace(${JSON.stringify(
          redirectUrl
        )});</script></body></html>`
      );
    return;
  } catch (e) {
    console.error("callback error", e);
    res.status(500).send("err");
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
