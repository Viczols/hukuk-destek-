// src/app/api/purchases/[purchaseId]/complete/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminBucket } from "../../../../src/lib/firebaseAdmin";
import { sendEmail } from "../../../../server_backup/api/sendEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const purchaseId = String(body.purchaseId || "").trim();
    let pdfUrl = String(body.pdfUrl || "");
    let userEmail = String(body.userEmail || "");
    const userId = String(body.userId || "");

    if (!purchaseId) {
      return NextResponse.json({ error: "purchaseId yok" }, { status: 400 });
    }

    // Belgeyi çek
    const ref = adminDb.collection("purchases").doc(purchaseId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "purchase_not_found" }, { status: 404 });
    const data = snap.data() || {};

    // Email yoksa purchases/users’tan bul
    if (!userEmail) {
      userEmail = data.customerEmail || data.email || data.userEmail || "";
      if (!userEmail && userId) {
        const u = await adminDb.collection("users").doc(userId).get().catch(() => null);
        if (u?.exists) userEmail = (u.data() as any)?.email || "";
      }
    }
    if (!userEmail) {
      return NextResponse.json({ error: "email_not_found" }, { status: 400 });
    }

    // PDF URL / Storage path
    const storagePath: string | undefined = data.storagePath;
    if (!pdfUrl) {
      pdfUrl = data.deliveredPdfUrl || data.downloadUrl || "";
    }
    const file = storagePath ? adminBucket.file(storagePath) : null;

    // Mail gönderimi: küçükse ek, büyükse link
    let result: any = { ok: false, skipped: true };
    if (file) {
      const [meta] = await file.getMetadata().catch(() => [null as any]);
      if (!meta && !pdfUrl) {
        return NextResponse.json({ error: "pdf_not_found" }, { status: 404 });
      }

      if (meta && Number(meta.size || 0) <= 7 * 1024 * 1024) {
        const [bytes] = await file.download();
        result = await sendEmail({
          to: userEmail,
          subject: "Dilekçeniz hazır",
          html: `<p>Merhaba,</p>
                 <p><b>${purchaseId}</b> numaralı dilekçeniz ektedir.</p>
                 <p>Panelinizden de indirebilirsiniz.</p>`,
          attachments: [{ filename: `dilekce-${purchaseId}.pdf`, content: bytes, contentType: "application/pdf" }],
        });
      } else {
        // linkli gönder (token’lı URL varsa onu kullan)
        if (!pdfUrl) {
          const [url] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 10 * 60 * 1000,
            version: "v4",
          });
          pdfUrl = url;
        }
        result = await sendEmail({
          to: userEmail,
          subject: "Dilekçeniz hazır",
          html: `<p>Merhaba,</p>
                 <p><b>${purchaseId}</b> numaralı dilekçeniz hazır.</p>
                 <p><a href="${pdfUrl}">PDF'i indirmek için tıklayın</a>.</p>`,
        });
      }
    } else if (pdfUrl) {
      result = await sendEmail({
        to: userEmail,
        subject: "Dilekçeniz hazır",
        html: `<p>Merhaba,</p>
               <p><b>${purchaseId}</b> numaralı dilekçeniz hazır.</p>
               <p><a href="${pdfUrl}">PDF'i indirmek için tıklayın</a>.</p>`,
      });
    } else {
      return NextResponse.json({ error: "no_pdf_info" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, purchaseId, sent: result });
  } catch (err) {
    console.error("[notify/purchase-pdf] error:", err);
    return NextResponse.json({ error: "notify_failed" }, { status: 500 });
  }
}