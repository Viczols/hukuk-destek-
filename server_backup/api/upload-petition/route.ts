// src/app/api/upload-petition/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb, adminBucket } from "../../../src/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart/form-data bekleniyor" }, { status: 400 });
    }

    const form = await req.formData();

    const purchaseId = String(
      (form.get("purchaseId") ||
        form.get("id") ||
        form.get("orderId") ||
        form.get("conversationId") ||
        "") as string
    ).trim();

    let file: File | null =
      (form.get("file") as File | null) ||
      (form.get("pdf") as File | null) ||
      (form.get("pdfFile") as File | null) ||
      (form.get("petition") as File | null) ||
      (form.get("petitionFile") as File | null) ||
      null;

    if (!purchaseId || !file) {
      return NextResponse.json({ error: "purchaseId/pdf yok" }, { status: 400 });
    }

    // ---- Storage: petitions/<purchaseId>.pdf
    const ab = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(ab);
    const storagePath = `petitions/${purchaseId}.pdf`;
    const token = randomUUID();
    const gcsFile = adminBucket.file(storagePath);

    await gcsFile.save(pdfBuffer, {
      resumable: false,
      contentType: "application/pdf",
      metadata: {
        contentDisposition: `attachment; filename="dilekce-${purchaseId}.pdf"`,
        metadata: { firebaseStorageDownloadTokens: token }, // kalıcı public download için
      },
    });

    const deliveredPdfUrl =
      `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/` +
      `${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    // ---- Firestore: sadece PDF bilgisi + in_progress (completed ise dokunma)
    const { firestore } = await import("firebase-admin");
    const ref = adminDb.collection("purchases").doc(purchaseId);
    const snap = await ref.get();
    const wasCompleted = snap.exists && (snap.data()?.status === "completed");

    await ref.set(
      {
        storagePath,
        deliveredPdfUrl,     // 👈 UI bununla çalışıyor
        pdfReady: true,
        ...(wasCompleted ? {} : { status: "in_progress" }),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, purchaseId, storagePath, deliveredPdfUrl });
  } catch (err) {
    console.error("[upload-petition] error:", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}