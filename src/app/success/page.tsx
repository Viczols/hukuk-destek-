"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Ana sayfada göstereceğin modal bilgisi vs.
    const pending = localStorage.getItem("pendingPurchaseType");
    const normalized = pending === "dilekce" || pending === "uzman" ? pending : null;
    localStorage.setItem("purchaseSuccess", JSON.stringify({ shown: false, type: normalized }));

    // Temizlik
    localStorage.removeItem("pendingPurchaseType");
    localStorage.removeItem("checkoutHtml");

    const t = setTimeout(() => router.push("/"), 2500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div style={{ textAlign: "center", padding: "40px 0", background: "#EBF0F5", minHeight: "100vh" }}>
      <div
        style={{
          background: "white",
          padding: "60px",
          borderRadius: "12px",
          boxShadow: "0 8px 30px rgba(0,0,0,.06)",
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
            fontFamily: "'Nunito Sans','Helvetica Neue',sans-serif",
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
            fontFamily: "'Nunito Sans','Helvetica Neue',sans-serif",
            fontSize: "20px",
            margin: 0,
          }}
        >
          Ödemeniz onaylandı. Ana sayfaya yönlendiriliyorsunuz…
        </p>

        <button
          onClick={() => router.push("/")}
          style={{
            marginTop: "24px",
            backgroundColor: "#88B04B",
            color: "#fff",
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
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
