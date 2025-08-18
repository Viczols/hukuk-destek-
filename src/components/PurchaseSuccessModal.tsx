// src/components/PurchaseSuccessModal.tsx
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

  // ---- UI helpers (koyu tema) ----
  const Title: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <h2
      style={{
        margin: 0,
        fontSize: 20,
        fontWeight: 700,
        color: "#FAFAFA",
        letterSpacing: -0.2,
      }}
    >
      {children ?? "Satın Alma Başarılı!"}
    </h2>
  );

  const Desc: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <p
      style={{
        margin: "10px 0 0",
        color: "#A1A1AA", // zinc-400
        lineHeight: 1.55,
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );

  const Info: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <p
      style={{
        marginTop: 14,
        fontSize: 13,
        color: "#9CA3AF", // zinc-400/500 arası
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );

  const Row: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginTop: 18,
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );

  // Primary: beyaz (site genel CTA stili), disabled koyu gri
  const Primary = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...p}
      style={{
        padding: "10px 16px",
        background: p.disabled ? "#3F3F46" : "#ffffff",
        color: p.disabled ? "#A1A1AA" : "#0A0A0B",
        border: "1px solid",
        borderColor: p.disabled ? "#3F3F46" : "#E5E7EB",
        borderRadius: 10,
        fontWeight: 600,
        cursor: p.disabled ? "not-allowed" : "pointer",
        transition: "filter .15s, background .15s",
        boxShadow: p.disabled ? "none" : "0 1px 0 rgba(255,255,255,0.05) inset",
      }}
      onMouseEnter={(e) => {
        if (!p.disabled) (e.currentTarget.style.filter = "brightness(0.95)");
      }}
      onMouseLeave={(e) => {
        if (!p.disabled) (e.currentTarget.style.filter = "none");
      }}
    />
  );

  // Secondary: koyu arka plan + ince çerçeve
  const Secondary = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...p}
      style={{
        padding: "10px 16px",
        background: "#111317",
        color: "#E5E7EB",
        border: "1px solid #3F3F46",
        borderRadius: 10,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background .15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1C1F25")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#111317")}
    />
  );

  // İnce ayırıcı
  const Divider = () => (
    <div
      style={{
        height: 1,
        width: "100%",
        marginTop: 16,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.12) 50%, rgba(255,255,255,0) 100%)",
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
          <Divider />

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
            Daha sonra <strong>Satın Alma Geçmişi</strong> bölümünden “<em>Dilekçeyi Yazdır</em>”
            butonuyla kaldığınız yerden devam edebilirsiniz.
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
          <Divider />

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
            Daha sonra <strong>Satın Alma Geçmişi</strong> bölümünden “<em>Görüşmeyi Başlat</em>”
            butonuyla süreci başlatabilirsiniz.
          </Info>
        </>
      );
    }

    // Tip gelmezse güvenli fallback
    return (
      <>
        <Title />
        <Desc>İşleminiz kaydedildi. Satın Alma Geçmişi’nden devam edebilirsiniz.</Desc>
        <Divider />
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
          backgroundColor: "rgba(0,0,0,0.6)", // daha koyu backdrop
          zIndex: 1000,
        },
        content: {
          inset: "50% auto auto 50%",
          transform: "translate(-50%, -50%)",
          maxWidth: 520,
          width: "92%",
          padding: 24,
          borderRadius: 16,
          border: "1px solid #2A2A2E", // ince koyu kenar
          // koyu panel + gradient
          background:
            "linear-gradient(180deg, rgba(22,23,26,1) 0%, rgba(16,16,18,1) 100%)",
          color: "#E5E7EB",
          boxShadow: "0 16px 48px rgba(0,0,0,.45)",
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
