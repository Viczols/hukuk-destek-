// app/api/blogUpload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extFromMime(mime?: string) {
  if (!mime) return "";
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return "";
}
function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function safeFilename(name: string, mime?: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const givenExt = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const preferredExt = extFromMime(mime) || givenExt || ".bin";
  return (slugify(base || "kapak") + preferredExt).replace(/^-+|-+$/g, "");
}

if (!getApps().length) {
  initializeApp({
    // Lokal/Cloud: ADC (Application Default Credentials) kullan
    credential: applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // örn: dilekce-destek.appspot.com
  });
}

export async function POST(req: NextRequest) {
  try {
    // --- Auth kontrol (Firebase ID token)
    const authHeader = req.headers.get("authorization") || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return NextResponse.json({ error: "auth", message: "Missing Bearer token" }, { status: 401 });
    }
    await getAdminAuth().verifyIdToken(m[1]);

    // --- Multipart form'u web API ile oku
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const postId = (form.get("postId") || "").toString();

    if (!file) {
      return NextResponse.json({ error: "bad-form", message: "`file` yok" }, { status: 400 });
    }
    if (!postId) {
      return NextResponse.json({ error: "bad-form", message: "`postId` yok" }, { status: 400 });
    }

    // --- Buffer'a çevir
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // --- Hedef path
    const fname = safeFilename(file.name, file.type);
    const dstPath = `covers/${postId}/${Date.now()}_${fname}`;

    // --- Storage'a yaz
    const bucket = getStorage().bucket();
    await bucket.file(dstPath).save(buffer, {
      resumable: false,
      contentType: file.type || "application/octet-stream",
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });

    // --- Public erişim URL'i (alt=media)
    const coverUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      dstPath
    )}?alt=media`;

    return NextResponse.json({ coverUrl, coverPath: dstPath }, { status: 200 });
  } catch (err: any) {
    console.error("blogUpload route error:", err);
    return NextResponse.json(
      { error: "server", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}
