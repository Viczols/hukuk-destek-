// src/components/Modal.tsx
"use client";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
  zIndex?: number;
}

export default function Modal({
  isOpen,
  onClose,
  children,
  size = "lg",
  closeOnBackdrop = true,
  zIndex = 1000,
}: ModalProps) {
  // layout.tsx şart değil: #modal-root yoksa body'ye taşır.
  const target = useMemo(() => {
    if (typeof window === "undefined") return null;
    return document.getElementById("modal-root") ?? document.body;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const sizeCls = size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-xl" : "max-w-md";

  const tree = (
    <div aria-modal="true" role="dialog" className="fixed inset-0" style={{ zIndex }}>
      {/* Backdrop (daha koyu) */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />
      {/* Scrollable + center */}
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div
            className={`w-full ${sizeCls} rounded-2xl border bg-zinc-900 text-zinc-100 
                        border-zinc-800 shadow-2xl animate-[fadeIn_0.15s_ease-out]`}
          >
            {/* Kapat */}
            <div className="flex items-center justify-end px-4 pt-4">
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="rounded-lg p-2 hover:bg-white/10 transition text-zinc-200"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* İçerik */}
            <div className="px-5 pb-5 max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(tree, target);
}
