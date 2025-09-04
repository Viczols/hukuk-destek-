// functions/src/blogUpload.ts
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import Busboy, { FileInfo } from "busboy";
import { v4 as uuidv4 } from "uuid";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

function setCors(res: any, req: any) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function getBearer(req: any): string | null {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m?.[1] || null;
}

export const blogUpload = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  setCors(res, req);

  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method", message: "Only POST allowed" }); return; }

  try {
    const idToken = getBearer(req);
    if (!idToken) { res.status(401).json({ error: "auth", message: "no token" }); return; }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;

    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 8 * 1024 * 1024 } });

    let postId: string | null = null;
    let fileMime = "";
    let fileNameFromClient = "";
    const fileChunks: Buffer[] = [];

    bb.on("field", (name: string, value: string) => {
      if (name === "postId") postId = String(value || "").trim();
    });

    bb.on("file", (_name: string, file: NodeJS.ReadableStream, info: FileInfo) => {
      fileNameFromClient = info.filename || "cover";
      fileMime = info.mimeType || "";
      file.on("data", (d: Buffer) => fileChunks.push(d));
      file.on("limit", () => { res.status(413).json({ error: "limit", message: "Dosya 8MB limitini aştı" }); });
    });

    bb.on("error", (err) => {
      const msg = (err as any)?.message || String(err);
      res.status(400).json({ error: "multipart-parse", message: msg });
    });

bb.on("finish", async () => {
  try {
    if (!postId) {
      res.status(400).json({ error: "bad-request", message: "postId gerekli" });
      return;
    }
    if (!fileChunks.length) {
      res.status(400).json({ error: "bad-request", message: "file alanı gerekli" });
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(fileMime)) {
      res.status(400).json({ error: "bad-request", message: "Sadece resim dosyaları kabul edilir" });
      return;
    }

    // 1) Mevcut post'u çek → eski kapak yolu
    const postRef = db.doc(`posts/${postId}`);
    const postSnap = await postRef.get();
    const prevPath = (postSnap.exists ? (postSnap.data()?.coverPath as string | undefined) : undefined) || undefined;

    // 2) Yeni yol: covers/<userId>/<postId>/<uuid>-...
    const buffer = Buffer.concat(fileChunks);
    const safeName = fileNameFromClient.replace(/\s+/g, "_");
    const objectPath = `covers/${userId}/${postId}/${uuidv4()}-${safeName}`;

    // 3) Yeni dosyayı kaydet
    const gcsFile = bucket.file(objectPath);
    await gcsFile.save(buffer, {
      contentType: fileMime,
      metadata: { metadata: { uploadedBy: userId, postId } },
      resumable: false,
    });

    // 4) Public URL
    const publicUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media`;

    // 5) Firestore'u yeni kapakla güncelle
    await postRef.set(
      {
        coverUrl: publicUrl,
        coverPath: objectPath,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 6) Eski kapak varsa sil (yeni yüklendikten sonra güvenli silme)
    if (prevPath && prevPath !== objectPath) {
      try {
        // Sadece covers/ klasörü altındakileri sil
        if (/^covers\//i.test(prevPath)) {
          await bucket.file(prevPath).delete({ ignoreNotFound: true });
          // console.log("[blogUpload] previous cover deleted:", prevPath);
        }
      } catch (delErr) {
        console.warn("[blogUpload] previous cover delete warn:", delErr);
      }
    }

    res.status(200).json({ ok: true, url: publicUrl, path: objectPath });
  } catch (e) {
    const msg = (e as any)?.message || "Sunucu hatası";
    res.status(500).json({ error: "server", message: msg });
  }
});

    // 🔑 ÖNEMLİ: Busboy'a ham gövdeyi ver (stream erken kapanma sorununu çözer)
    const anyReq = req as any;
    if (anyReq.rawBody && Buffer.isBuffer(anyReq.rawBody)) {
      bb.end(anyReq.rawBody);
    } else {
      const chunks: Buffer[] = [];
      req.on("data", (d: Buffer) => chunks.push(d));
      req.on("end", () => bb.end(Buffer.concat(chunks)));
      req.on("aborted", () => { res.status(499).json({ error: "client-abort", message: "Upload aborted by client" }); });
    }
  } catch (e) {
    const msg = (e as any)?.message || "Upload parse error";
    res.status(400).json({ error: "multipart-parse", message: msg });
  }
});
