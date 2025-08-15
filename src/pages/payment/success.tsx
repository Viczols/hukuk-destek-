"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymentSuccess() {
  const [status, setStatus] = useState("Ödemeniz doğrulanıyor...");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("Ödeme doğrulama hatası: Token bulunamadı.");
      setTimeout(() => router.push("/"), 3000);
      return;
    }

    setStatus("Satın alma talebiniz başarıyla alındı.");

    // ✅ pendingPurchaseType'ı al ve purchaseSuccess'a doğru tipte yaz
    const pending = localStorage.getItem("pendingPurchaseType");
    const normalized =
      pending === "dilekce" || pending === "uzman" ? pending : null;

    localStorage.setItem(
      "purchaseSuccess",
      JSON.stringify({ shown: false, type: normalized })
    );
    localStorage.removeItem("pendingPurchaseType");

    const timeout = setTimeout(() => {
      router.push("/");
    }, 3000);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <div style={{ textAlign: "center", padding: "40px 0", background: "#EBF0F5", minHeight: "100vh" }}>
      <div
        style={{
          background: "white",
          padding: "60px",
          borderRadius: "4px",
          boxShadow: "0 2px 3px #C8D0D8",
          display: "inline-block",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            borderRadius: "200px",
            height: "200px",
            width: "200px",
            background: "#F8FAF5",
            margin: "0 auto",
          }}
        >
          <i
            style={{
              color: "#9ABC66",
              fontSize: "100px",
              lineHeight: "200px",
              marginLeft: "-15px",
              fontStyle: "normal",
            }}
          >
            ✓
          </i>
        </div>
        <h1
          style={{
            color: "#88B04B",
            fontFamily: "'Nunito Sans', 'Helvetica Neue', sans-serif",
            fontWeight: 900,
            fontSize: "40px",
            marginBottom: "10px",
          }}
        >
          Başarılı
        </h1>
        <p
          style={{
            color: "#404F5E",
            fontFamily: "'Nunito Sans', 'Helvetica Neue', sans-serif",
            fontSize: "20px",
            margin: "0",
          }}
        >
          {status}
        </p>
        <button
          onClick={() => router.push("/")}
          style={{
            marginTop: "25px",
            backgroundColor: "#88B04B",
            color: "#fff",
            padding: "10px 20px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          Ana Sayfaya Dön
        </button>
      </div>
    </div>
  );
}
