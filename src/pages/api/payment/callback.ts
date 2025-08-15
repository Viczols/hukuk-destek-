import { NextApiRequest, NextApiResponse } from "next";
import Iyzipay from "iyzipay";

// 🔽 Admin SDK: alias yoksa yolu relative yap: "../../lib/firebaseAdmin"
import { adminDb, adminRtdb, AdminFs, Admin } from "../../../lib/firebaseAdmin";

// --- ESKİ client SDK importları artık gereksiz ---
// import { dbFirestore } from "../../../firebase/config";
// import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY!,
  secretKey: process.env.IYZICO_SECRET_KEY!,
  uri: process.env.IYZICO_BASE_URL!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { userId, type, productKey } = req.query;
  const { token, price } = req.body;

  console.log("📥 [CALLBACK] Query Params:", req.query);
  console.log("📥 [CALLBACK] Body:", req.body);

  if (!token) {
    console.error("❌ [CALLBACK] Token bulunamadı");
    return res.status(400).json({ message: "Token yok" });
  }

  try {
    const request = { locale: Iyzipay.LOCALE.TR, token };

    iyzipay.checkoutForm.retrieve(request, async (err: any, result: any) => {
      if (err) {
        console.error("📥 [CALLBACK] Iyzico Error:", err);
        return res.redirect("/payment/failed");
      }

      console.log("📥 [CALLBACK] Retrieve Result:", result);

      if (result.status === "success" && result.paymentStatus === "SUCCESS") {
        try {
          // 🔑 productKey normalize
          const normalizedKey =
            (productKey as string) ||
            (typeof type === "string" && type.toLowerCase().includes("görüşme")
              ? "gorusme"
              : "dilekce");

          // ✅ Admin SDK ile Firestore'a yaz (rules bypass)
          const docRef = await adminDb.collection("purchases").add({
            userId: String(userId),                             // kullanıcı UID
            productType: type || "Bilinmeyen Paket",
            type: normalizedKey,                                // önceki kayıtlarda 'type' kullanılıyor olabilir
            productKey: normalizedKey,                          // yeni alan (varsa UI için)
            price: result.price || price || 0,
            paymentId: result.paymentId,
            token: token,
            status: "pending",
            createdAt: AdminFs.FieldValue.serverTimestamp(),    // yeni alan
            date: AdminFs.FieldValue.serverTimestamp(),         // eski UI uyumu için
          });

          // (Opsiyonel) Görüşme/Uzman ise RTDB'de chat ticket aç
          if (normalizedKey === "gorusme" || normalizedKey === "uzman") {
            try {
              await adminRtdb.ref(`chatTickets/${docRef.id}`).set({
                userId: String(userId),
                purchaseId: docRef.id,
                type: normalizedKey,
                status: "open", // open -> active -> closed
                assignedLawyer: null,
                createdAt: Admin.database.ServerValue.TIMESTAMP,
              });
              console.log("✅ [CALLBACK] RTDB chatTickets oluşturuldu:", docRef.id);
            } catch (rtErr) {
              console.warn("⚠️ [CALLBACK] RTDB chatTickets oluşturulamadı:", rtErr);
              // ticket açılmasa da satın alma kaydı tamam — akışı bozma
            }
          }

          console.log("✅ [CALLBACK] Satın alma veritabanına kaydedildi (Admin SDK)");
        } catch (dbError) {
          console.error("⚠️ [CALLBACK] Firestore kayıt hatası (Admin SDK):", dbError);
          // Satın alma kaydı admin tarafa yazılamazsa, yine de failed sayfasına yönlendirebilirsin:
          // return res.redirect("/payment/failed");
        }

        return res.redirect(307, `/payment/success?token=${token}`);
      } else {
        console.error("❌ [CALLBACK] Ödeme başarısız:", result);
        return res.redirect("/payment/failed");
      }
    });
  } catch (error) {
    console.error("🔥 [CALLBACK] Sunucu hatası:", error);
    return res.redirect("/payment/failed");
  }
}
