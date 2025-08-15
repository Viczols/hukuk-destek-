"use client";

import React, { useEffect } from "react";
import Modal from "react-modal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  type: "dilekce" | "uzman" | null;
  onlineLawyers: number;
};

// App Router'da güvenli kök
Modal.setAppElement("body");

export default function PurchaseSuccessModal({
  isOpen,
  onClose,
  type,
  onlineLawyers,
}: Props) {
  // Sayfa scroll'unu kilitle/aç
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
  }, [isOpen]);

  // --- küçük UI yardımcıları ---
  const Title: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
      {children ?? "Satın Alma Başarılı!"}
    </h2>
  );

  const Desc: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <p style={{ margin: "8px 0 0", color: "#374151", lineHeight: 1.5, textAlign: "center" }}>
      {children}
    </p>
  );

  const Info: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <p style={{ marginTop: 12, fontSize: 13, color: "#6B7280", textAlign: "center" }}>
      {children}
    </p>
  );

  const Row: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "center", flexWrap: "wrap" }}>
      {children}
    </div>
  );

  const Primary = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...p}
      style={{
        padding: "10px 16px",
        background: p.disabled ? "#9CA3AF" : "#2563EB",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontWeight: 600,
        cursor: p.disabled ? "not-allowed" : "pointer",
        transition: "filter .15s",
      }}
      onMouseEnter={(e) => {
        if (!p.disabled) (e.currentTarget.style.filter = "brightness(1.05)");
      }}
      onMouseLeave={(e) => {
        if (!p.disabled) (e.currentTarget.style.filter = "none");
      }}
    />
  );

  const Secondary = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...p}
      style={{
        padding: "10px 16px",
        background: "#E5E7EB",
        color: "#111827",
        border: "none",
        borderRadius: 8,
        fontWeight: 600,
        cursor: "pointer",
      }}
    />
  );

  // --- içerik mantığı ---
  const renderBody = () => {
    if (type === "dilekce") {
      return (
        <>
          <Title>AI Destekli Dilekçe</Title>
          <Desc>AI ile dilekçe yazımına hemen başlayabilirsiniz.</Desc>

          <Row>
            <Primary
              onClick={() => {
                // TODO: AI dilekçe sayfasına yönlendir (örn. router.push('/ai'))
                onClose();
              }}
            >
              Hemen Başla
            </Primary>

            <Secondary onClick={onClose}>Daha Sonra Devam Et</Secondary>
          </Row>

          <Info>
            Daha sonra <strong>Satın Alma Geçmişi</strong> bölümünden
            “<em>Dilekçeyi Yazdır</em>” butonuyla kaldığınız yerden devam edebilirsiniz.
          </Info>
        </>
      );
    }

    if (type === "uzman") {
      const noExperts = onlineLawyers <= 0;

      return (
        <>
          <Title>Uzman Yardımıyla Dilekçe</Title>
          <Desc>
            {noExperts
              ? "Şu anda çevrim içi uzman bulunmuyor. Çalışma saatleri (09:00 – 18:00) içerisinde tekrar deneyebilirsiniz."
              : "Bir uzmanla hemen görüşmeyi başlatabilirsiniz."}
          </Desc>

          <Row>
            <Primary
              disabled={noExperts}
              title={noExperts ? "Şu anda çevrim içi uzman yok" : undefined}
              onClick={() => {
                if (noExperts) return;
                // TODO: Sohbet penceresini aç / chat akışını başlat
                onClose();
              }}
            >
              Görüşmeyi Başlat
            </Primary>

            <Secondary onClick={onClose}>Daha Sonra Devam Et</Secondary>
          </Row>

          <Info>
            Daha sonra <strong>Satın Alma Geçmişi</strong> bölümünden
            “<em>Görüşmeyi Başlat</em>” butonuyla süreci başlatabilirsiniz.
          </Info>
        </>
      );
    }

    // Tip gelmezse güvenli fallback
    return (
      <>
        <Title />
        <Desc>İşleminiz kaydedildi. Satın Alma Geçmişi’nden devam edebilirsiniz.</Desc>
        <Row>
          <Secondary onClick={onClose}>Tamam</Secondary>
        </Row>
      </>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      shouldCloseOnOverlayClick={false}
      contentLabel="Satın Alma Sonrası"
      style={{
        overlay: {
          backgroundColor: "rgba(0,0,0,0.35)", // arkaplan görünür kalsın
          zIndex: 1000,
        },
        content: {
          inset: "50% auto auto 50%",
          transform: "translate(-50%, -50%)",
          maxWidth: 520,
          width: "92%",
          padding: 24,
          borderRadius: 12,
          border: "none",
          boxShadow: "0 12px 32px rgba(0,0,0,.22)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        },
      }}
    >
      {renderBody()}
    </Modal>
  );
}
