// functions/src/blogDelete.ts
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

function setCors(res: any, req: any) {
  const origin = req.headers?.origin || "*";
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

export const blogDelete = onRequest({ region: "europe-west1", cors: true }, async (req: any, res: any): Promise<void> => {
  setCors(res, req);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method", message: "Only POST" });
    return;
  }

  try {
    // Auth
    const token = getBearer(req);
    if (!token) {
      res.status(401).json({ error: "auth", message: "no token" });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    const userId = decoded.uid;

    // Body (JSON) — rawBody varsa oradan oku, yoksa req.body
    let body: any = {};
    try {
      body = req.rawBody ? JSON.parse(req.rawBody.toString()) : (req.body || {});
    } catch {
      body = req.body || {};
    }
    const postId: string | undefined = body?.postId;
    if (!postId) {
      res.status(400).json({ error: "bad-request", message: "postId gerekli" });
      return;
    }

    // Post getir + yetki kontrolü
    const postRef = db.doc(`posts/${postId}`);
    const snap = await postRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: "not-found", message: "Post yok" });
      return;
    }
    const data = snap.data() || {};
    if (data.authorId !== userId) {
      res.status(403).json({ error: "forbidden", message: "Bu post size ait değil" });
      return;
    }

    // --- STORAGE TEMİZLİĞİ ---
    // Yeni klasör yapısı + legacy yollar + tekil coverPath + olası galeriler
    const prefixes: string[] = [
      `covers/${userId}/${postId}/`, // yeni yapı
      `covers/${postId}/`,           // legacy
    ];

    const deletions: Promise<any>[] = [];

    // 1) Klasör bazlı toplu silme
    for (const prefix of prefixes) {
      deletions.push(
        bucket.deleteFiles({ prefix }).catch((e: any) => {
          console.warn("[blogDelete] deleteFiles warn:", prefix, e?.message || String(e));
        })
      );
    }

    // 2) Tekil coverPath (farklı yerde olabilir)
    const prevCoverPath = typeof data.coverPath === "string" ? data.coverPath : undefined;
    if (prevCoverPath) {
      deletions.push(
        bucket.file(prevCoverPath).delete({ ignoreNotFound: true as any }).catch((e: any) => {
          console.warn("[blogDelete] single cover delete warn:", prevCoverPath, e?.message || String(e));
        })
      );
    }

    // 3) Galeri / diğer görseller (varsa)
    const galleryCandidates: unknown[] = [];
    if (Array.isArray((data as any).imagePaths)) galleryCandidates.push(...(data as any).imagePaths);
    if (Array.isArray((data as any).images)) galleryCandidates.push(...(data as any).images);

    for (const p of galleryCandidates) {
      if (typeof p === "string" && p.trim()) {
        deletions.push(
          bucket.file(p).delete({ ignoreNotFound: true as any }).catch((e: any) => {
            console.warn("[blogDelete] gallery delete warn:", p, e?.message || String(e));
          })
        );
      }
    }

    await Promise.all(deletions);

    // --- FIRESTORE SİLME ---
    await postRef.delete();

    res.status(200).json({ ok: true, deletedPostId: postId });
    return;
  } catch (e) {
    const msg = (e as any)?.message || "Sunucu hatası";
    res.status(500).json({ error: "server", message: msg });
    return;
  }
});
