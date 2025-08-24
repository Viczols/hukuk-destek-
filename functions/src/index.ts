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
const SITE_ORIGIN = defineString("SITE_ORIGIN");           // functions/.env
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

/* -------------------- 1) Ödeme başlatma -------------------- */
app.post("/createSession", async (req, res) => {
  try {
    const { userId, email, productKey, price, returnUrl } = req.body || {};
    if (!userId || !email || !productKey || !price) {
      res.status(400).json({ ok: false, error: "Eksik alan" });
      return;
    }

    const purchaseRef = db.collection("purchases").doc();
    await purchaseRef.set({
      userId,
      email,
      productKey,
      price,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // TODO: İyzico init çağrını burada yap (axios ile) ve dönen HTML/token'a göre davran.
    // const { data } = await axios.post(..., ..., {
    //   auth: { username: IYZICO_API_KEY.value(), password: IYZICO_SECRET.value() },
    // });

    // Şimdilik demo HTML (redirect.tsx sayfanda innerHTML ile basıyorsun)
    const html = `
      <html><body>
        <form id="f" method="POST" action="${returnUrl || SITE_ORIGIN.value() + "/success"}">
          <input type="hidden" name="purchaseId" value="${purchaseRef.id}" />
        </form>
        <script>document.getElementById('f').submit()</script>
      </body></html>
    `;
    res.json({ ok: true, purchaseId: purchaseRef.id, html });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* -------------------- 2) Ödeme callback -------------------- */
app.post("/paymentCallback", async (req, res) => {
  try {
    const { purchaseId, status, paidPrice, raw } = req.body || {};
    if (!purchaseId) {
      res.status(400).send("missing purchaseId");
      return;
    }

    const updates: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      gatewayRaw: raw || req.body,
      status: status === "success" ? "paid" : "failed",
    };
    if (paidPrice) updates.paidPrice = paidPrice;

    await db.collection("purchases").doc(String(purchaseId)).set(updates, { merge: true });
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.status(500).send("err");
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
