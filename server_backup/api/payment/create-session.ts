// /api/payment/create-session.ts
import { NextApiRequest, NextApiResponse } from "next";
import Iyzipay from "iyzipay";
import { adminDb, AdminFs } from "../../../src/lib/firebaseAdmin"; // yolu projene göre düzelt

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY!,
  secretKey: process.env.IYZICO_SECRET_KEY!,
  uri: process.env.IYZICO_BASE_URL!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const { email, name, userId, productType, productKey, price } = req.body;

    // 1) Intent dokümanı oluştur (UI geçmişinde görünmeyecek)
    const intentRef = await adminDb.collection("paymentIntents").add({
      userId,
      email,
      name,
      productType,
      productKey,
      price,
      status: "initiated",                  // initiated | paid | failed
      createdAt: AdminFs.FieldValue.serverTimestamp(),
    });

    // 2) Iyzico request hazırla (aynı mantık sende var)
    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: intentRef.id,        // intentId'yi conversationId olarak set et
      price: String(price),
      paidPrice: String(price),
      currency: Iyzipay.CURRENCY.TRY,
      installment: "1",
      basketId: productKey,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: `${process.env.SITE_ORIGIN}/api/payment/callback`, // mevcut callback
      // buyer, addresses, basketItems ... (sende nasılsa aynı)
    };

    iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
      if (err) {
        console.error("CREATE-SESSION error:", err);
        return res.status(500).json({ error: "Ödeme linki alınamadı" });
      }
      if (result?.paymentPageUrl) {
        // intent’e iyzico token’ı yaz
        adminDb.collection("paymentIntents").doc(intentRef.id).set(
          { iyzicoToken: result.token ?? null, iyzicoRaw: result ?? null },
          { merge: true }
        );
        return res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
      }
      return res.status(500).json({ error: "Ödeme linki alınamadı" });
    });
  } catch (e) {
    console.error("CREATE-SESSION exception:", e);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
}
