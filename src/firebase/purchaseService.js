// src/firebase/purchaseService.js
import { dbFirestore /*, dbRealtime*/ } from "./config";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp as fsServerTimestamp,
} from "firebase/firestore";
// import { ref as rRef, set as rSet, serverTimestamp as rtdbServerTimestamp } from "firebase/database";

// Satın alma kaydet (SADECE Firestore, status: 'pending')
export const savePurchase = async (
  userId,
  productType,   // 'Uzman Yardımıyla Dilekçe Yazımı' vs.
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
      createdAt: fsServerTimestamp(),
    });

    // ❌ ESKİ: ödeme öncesi RTDB ticket açma
    // if (productKey === "gorusme" || productKey === "uzman") { ... }

    return { ok: true, id: docRef.id };
  } catch (error) {
    console.error("⚠️ Firestore kayıt hatası:", error);
    return { ok: false, error };
  }
};

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