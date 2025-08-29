// /api/payment/callback.ts
import { NextApiRequest, NextApiResponse } from "next";
import Iyzipay from "iyzipay";
import { adminDb, adminRtdb, AdminFs } from "../../../src/lib/firebaseAdmin"; // yolu projene göre düzelt

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY!,
  secretKey: process.env.IYZICO_SECRET_KEY!,
  uri: process.env.IYZICO_BASE_URL!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.body?.token || req.query?.token;
    if (!token) return res.redirect("/payment/failed");

    iyzipay.checkoutForm.retrieve({ locale: Iyzipay.LOCALE.TR, token }, async (err: any, result: any) => {
      if (err) {
        console.error("CALLBACK retrieve error:", err);
        return res.redirect("/payment/failed");
      }

      const success = result?.paymentStatus === "SUCCESS";
      // Token’dan intent bul
      const intentSnap = await adminDb.collection("paymentIntents").where("iyzicoToken", "==", token).limit(1).get();
      const intentDoc = intentSnap.empty ? null : intentSnap.docs[0];

      if (!intentDoc) {
        console.warn("CALLBACK: intent bulunamadı, token:", token);
        return res.redirect("/payment/failed");
      }

      const intentId = intentDoc.id;
      const intent = intentDoc.data() || {};

      if (!success) {
        await adminDb.collection("paymentIntents").doc(intentId).set(
          { status: "failed", iyzicoResponse: result ?? null, updatedAt: AdminFs.FieldValue.serverTimestamp() },
          { merge: true }
        );
        return res.redirect("/payment/failed");
      }

      // Başarılı: intent -> paid
      await adminDb.collection("paymentIntents").doc(intentId).set(
        { status: "paid", iyzicoResponse: result ?? null, updatedAt: AdminFs.FieldValue.serverTimestamp() },
        { merge: true }
      );

      // YALNIZCA burada purchases oluştur
      const purchaseRef = await adminDb.collection("purchases").add({
        userId: intent.userId,
        email: intent.email,
        type: intent.productType,          // örn: "Görüşme Paketi" (UI’da label)
        productKey: intent.productKey,     // "gorusme" | "uzman" | "dilekce"
        price: intent.price,
        paymentStatus: "paid",             // sadece ödeme teyidi
        status: "pending",                 // TESLİMAT durumu sizde; completed’i PDF yüklerken yazacaksınız
        createdAt: AdminFs.FieldValue.serverTimestamp(),
        paidAt: AdminFs.FieldValue.serverTimestamp(),
        intentId,
      });

      // (Opsiyonel) Görüşme/Uzman ise chatTicket aç
      const normalizedKey = String(intent.productKey || "").toLowerCase();
      if (normalizedKey === "gorusme" || normalizedKey === "uzman") {
        try {
          await adminRtdb.ref(`chatTickets/${purchaseRef.id}`).set({
            userId: String(intent.userId),
            purchaseId: purchaseRef.id,
            type: normalizedKey,
            status: "open", // open -> active -> closed
            assignedLawyer: null,
            createdAt: Date.now(),
          });
        } catch (rtErr) {
          console.warn("CALLBACK: chatTickets oluşturulamadı:", rtErr);
        }
      }

      return res.redirect(307, `/payment/success?token=${token}`);
    });
  } catch (e) {
    console.error("CALLBACK exception:", e);
    return res.redirect("/payment/failed");
  }
}
