import { NextApiRequest, NextApiResponse } from "next";
import Iyzipay from "iyzipay";

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY!,
  secretKey: process.env.IYZICO_SECRET_KEY!,
  uri: process.env.IYZICO_BASE_URL!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { email, name, userId, productType, productKey, price } = req.body;

    console.log("📥 [CREATE-SESSION] Body:", req.body);

    // ✅ Iyzico ödeme formu isteği
    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: String(Date.now()),
      price: String(price),
      paidPrice: String(price),
      currency: Iyzipay.CURRENCY.TRY,
      basketId: "B67832",
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/callback?userId=${userId}&type=${encodeURIComponent(productType)}&productKey=${productKey}`,
      buyer: {
        id: userId,
        name: name,
        surname: "Kullanıcı",
        gsmNumber: "+905350000000",
        email: email,
        identityNumber: "74300864791",
        registrationAddress: "İstanbul Türkiye",
        city: "İstanbul",
        country: "Türkiye",
        zipCode: "34000",
      },
      shippingAddress: {
        contactName: name,
        city: "İstanbul",
        country: "Türkiye",
        address: "Online Hizmet",
        zipCode: "34000",
      },
      billingAddress: {
        contactName: name,
        city: "İstanbul",
        country: "Türkiye",
        address: "Online Hizmet",
        zipCode: "34000",
      },
      basketItems: [
        {
          id: productKey,
          name: productType,
          category1: "Hukuk Destek",
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: String(price),
        },
      ],
    };

    iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
      if (err) {
        console.error("❌ [CREATE-SESSION] Iyzico Hata:", err);
        return res.status(500).json({ error: "Ödeme başlatılamadı" });
      }

      console.log("✅ [CREATE-SESSION] Iyzico Yanıtı:", result);

      if (result?.paymentPageUrl) {
        return res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
      } else {
        return res.status(500).json({ error: "Ödeme linki alınamadı" });
      }
    });
  } catch (error) {
    console.error("🔥 [CREATE-SESSION] Sunucu hatası:", error);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
}
