"use client";

import { useRouter } from "next/navigation";

export default function PaymentFailed() {
  const router = useRouter();

  return (
    <div style={{ textAlign: "center", padding: "40px 0", background: "#FDECEC", minHeight: "100vh" }}>
      <div
        style={{
          background: "white",
          padding: "60px",
          borderRadius: "4px",
          boxShadow: "0 2px 3px #F5B5B5",
          display: "inline-block",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            borderRadius: "200px",
            height: "200px",
            width: "200px",
            background: "#FFF5F5",
            margin: "0 auto",
          }}
        >
          <i
            style={{
              color: "#E74C3C",
              fontSize: "100px",
              lineHeight: "200px",
              marginLeft: "-10px",
              fontStyle: "normal",
            }}
          >
            ✗
          </i>
        </div>
        <h1
          style={{
            color: "#E74C3C",
            fontFamily: "'Nunito Sans', 'Helvetica Neue', sans-serif",
            fontWeight: 900,
            fontSize: "40px",
            marginBottom: "10px",
          }}
        >
          Ödeme Başarısız
        </h1>
        <p
          style={{
            color: "#5D5D5D",
            fontFamily: "'Nunito Sans', 'Helvetica Neue', sans-serif",
            fontSize: "20px",
            margin: "0",
          }}
        >
          Ödemeniz sırasında bir hata oluştu veya işlem reddedildi.
          <br /> Lütfen tekrar deneyin veya farklı bir yöntem kullanın.
        </p>

        {/* ✅ Ortalanmış Ana Sayfa Butonu */}
        <div style={{ marginTop: "25px", textAlign: "center" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              backgroundColor: "#E74C3C",
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
    </div>
  );
}
