// app/api/upload-petition/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDB, adminBucket } from "../../../lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1) Auth
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // 2) FormData
    const form = await req.formData();
    const purchaseId = form.get("purchaseId") as string | null;
    const file = form.get("file") as File | null;

    if (!purchaseId || !file) {
      return NextResponse.json({ error: "purchaseId ve file zorunlu" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Sadece PDF yükleyin" }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF 25MB’ı geçemez" }, { status: 400 });
    }

    // 3) Yetki — purchases + chatTickets üzerinden esnek doğrulama
    const pref = adminDB.doc(`purchases/${purchaseId}`);
    const pdoc = await pref.get();
    if (!pdoc.exists) {
      return NextResponse.json({ error: "Purchase bulunamadı" }, { status: 404 });
    }
    const pdata = pdoc.data() || {};
    const assigned: string | undefined = pdata.assignedLawyerId;

    let canProceed = assigned === uid;

    // purchases'ta yoksa, chatTickets'ta sana atanmış mı?
    if (!canProceed) {
      try {
        const tdoc = await adminDB.doc(`chatTickets/${purchaseId}`).get();
        const tdata = tdoc.exists ? tdoc.data() : null;
        if (tdata && (tdata as any).assignedLawyer === uid) {
          canProceed = true;
          // purchases tarafını da kalıcı hale getir
          if (!assigned || assigned === "") {
            await pref.update({ assignedLawyerId: uid });
          }
        }
      } catch {}
    }

    // İstersen: tamamen atanmamışsa (assigned boş) bana ata
    if (!canProceed && (!assigned || assigned === "")) {
      canProceed = true;
      await pref.update({ assignedLawyerId: uid });
    }

    if (!canProceed) {
      return NextResponse.json({ error: "Bu purchase size atanmış değil" }, { status: 403 });
    }

    // 4) Storage'a yükle (Admin SDK — CORS yok)
    const buffer = Buffer.from(await file.arrayBuffer());
    const objectPath = `petitions/${purchaseId}.pdf`;
    const tokenMeta = crypto.randomUUID();

    await adminBucket.file(objectPath).save(buffer, {
      contentType: "application/pdf",
      resumable: false,
      metadata: { metadata: { firebaseStorageDownloadTokens: tokenMeta } },
    });

    const bucket = adminBucket.name;
    const encoded = encodeURIComponent(objectPath);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media&token=${tokenMeta}`;

    // 5) Firestore'u güncelle
    await pref.update({
      deliveredPdfUrl: downloadUrl,
      status: "in_progress",
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, url: downloadUrl });
  } catch (e: any) {
    console.error("[upload-petition] error:", e);
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
