// src/firebase/purchaseService.js  (konuma göre yolu ayarla)
import { dbFirestore, dbRealtime } from "./config"; // <-- yolu projene göre düzelt
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp as fsServerTimestamp,
} from "firebase/firestore";
import {
  ref as rRef,
  set as rSet,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";

// Satın alma kaydet
export const savePurchase = async (
  userId,
  productType,   // Görsel isim (örn: 'Uzman Yardımıyla Dilekçe Yazımı')
  productKey,    // 'dilekce' | 'uzman' | 'gorusme'
  price,
  paymentId,
  token
) => {
  try {
    const docRef = await addDoc(collection(dbFirestore, "purchases"), {
      userId,
      type: productKey,
      productType,
      status: "pending",
      price,
      paymentId,
      token,
      createdAt: fsServerTimestamp(), // <-- tek doğrusal alan
    });

    // Görüşme/Uzman ise RTDB'de chat ticket aç
    if (productKey === "gorusme" || productKey === "uzman") {
      const tRef = rRef(dbRealtime, `chatTickets/${docRef.id}`);
      await rSet(tRef, {
        userId,
        purchaseId: docRef.id,
        type: productKey,
        status: "open",    // open -> active -> closed
        assignedLawyer: null,
        createdAt: rtdbServerTimestamp(),
      });
    }

    console.log("✅ Firestore'a satın alma kaydedildi:", productKey);
    return { ok: true, id: docRef.id };
  } catch (error) {
    console.error("⚠️ Firestore kayıt hatası:", error);
    return { ok: false, error };
  }
};

// Satın alma geçmişi
export const getPurchaseHistory = async (userId) => {
  try {
    const q = query(
      collection(dbFirestore, "purchases"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    const purchases = [];
    snap.forEach((d) => purchases.push({ id: d.id, ...d.data() }));
    return purchases;
  } catch (error) {
    console.error("⚠️ Firestore'dan satın alma geçmişi alınamadı:", error);
    return [];
  }
};
