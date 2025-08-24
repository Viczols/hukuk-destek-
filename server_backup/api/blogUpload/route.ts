// src/app/api/blogUpload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminBucket, adminApp } from "../../../src/lib/firebaseAdmin"; // firebaseAdmin'i bozma, sadece import et
import { getAuth } from "firebase-admin/auth";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  try {
    // 1) (Opsiyonel ama önerilir) Auth: Panel zaten login; ID token varsa uid çıkar
    let uid = "anonymous";
    const authz = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authz?.startsWith("Bearer ")) {
      try {
        const idToken = authz.slice(7);
        const decoded = await getAuth(adminApp).verifyIdToken(idToken);
        uid = decoded.uid || uid;
      } catch {
        // token hatası var ise, güvenliği zorunlu tutmak istemiyorsan yutabilirsin
        // uid 'anonymous' kalır; dilersen burada 401 de dönebilirsin.
      }
    }

    // 2) FormData
    const form = await req.formData();
    const file   = form.get("file") as File | null;
    const postId = String(form.get("postId") || "");
    if (!file || !postId) {
      return NextResponse.json({ error: "Missing file/postId" }, { status: 400 });
    }

    // 3) Dosya adı ve path
    const buf = Buffer.from(await file.arrayBuffer());
    const dot  = file.name.lastIndexOf(".");
    const base = dot > -1 ? file.name.slice(0, dot) : file.name;
    const ext  = dot > -1 ? file.name.slice(dot).toLowerCase() : "";
    const safe = `${slugify(base || "kapak")}${ext || ""}`;

    const path = `covers/${uid}/${postId}/${safe}`;
    const gcsFile = adminBucket.file(path);

    // 4) Storage'a kaydet
    await gcsFile.save(buf, {
      resumable: false,
      contentType: file.type || "application/octet-stream",
      metadata: { cacheControl: "public, max-age=31536000" },
    });

    // 5) Uzun süreli okunabilir imzalı URL
    const [signedUrl] = await gcsFile.getSignedUrl({
      action: "read",
      expires: "2035-01-01",
    });

    return NextResponse.json({ coverUrl: signedUrl, coverPath: path }, { status: 200 });
  } catch (err: any) {
    console.error("UPLOAD API ERROR:", err?.message || err);
    return NextResponse.json(
      { error: "upload-failed", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
