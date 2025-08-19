// src/components/ChatButton.tsx
"use client";

import React from "react";

type Props = {
  onClick: () => void;
  expertOnline?: boolean;
  unreadCount?: number;
};

const ChatButton: React.FC<Props> = ({ onClick, expertOnline = false, unreadCount = 0 }) => {
  const count = Number.isFinite(unreadCount) && unreadCount > 0 ? unreadCount : 0;

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000 }}>
      <button
        onClick={onClick}
        aria-label="Sohbeti aç"
        style={{
          position: "relative",
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          background: "#ffffff", // beyaz arka plan
          boxShadow: "0 14px 30px rgba(0,0,0,0.35), 0 0 0 4px rgba(255,255,255,0.15)",
          display: "grid",
          placeItems: "center",
          transition: "transform .12s ease, filter .12s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.98)")}
        onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        {/* durum noktası */}
        <span
          title={expertOnline ? "Uzman çevrimiçi" : "Uzman çevrimdışı"}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: expertOnline ? "#22c55e" : "#9ca3af",
            boxShadow: expertOnline ? "0 0 0 2px rgba(34,197,94,.25)" : "none",
          }}
        />

        {/* siyah sohbet ikonu (kontrast) */}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 12c0 3.866-3.582 7-8 7-1.043 0-2.04-.16-2.957-.45L4 20l1.45-4.957C5.16 14.126 5 13.13 5 12c0-3.866 3.582-7 8-7s7 3.134 7 7Z"
            fill="#0f1115"
          />
        </svg>

        {/* okunmamış rozet */}
        {count > 0 && (
          <span
            aria-label={`${count} okunmamış mesaj`}
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              borderRadius: 999,
              background: "#ef4444",
              color: "#fff",
              fontSize: 12,
              lineHeight: "20px",
              textAlign: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              userSelect: "none",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </div>
  );
};

export default ChatButton;
