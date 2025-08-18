// src/components/LoginForm.tsx
"use client";

import { useState } from "react";
import { loginUser } from "../firebase/authService";
import { setLawyerOnline } from "../firebase/presenceService";
import { getFirestore, doc, getDoc } from "firebase/firestore";

interface Props {
  switchToRegister: () => void;
  onSuccess: () => void;
}

export default function LoginForm({ switchToRegister, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const userCredential = await loginUser(email, password);
      const uid = userCredential.user.uid;
      const userDoc = await getDoc(doc(getFirestore(), "users", uid));
      if (userDoc.exists() && userDoc.data().role === "lawyer") {
        setLawyerOnline(uid, userCredential.user.email);
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Başlık */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold text-white tracking-tight">Giriş Yap</h2>
        <p className="text-sm text-zinc-300/80 mt-1">Hesabınıza erişin ve işlemlere devam edin.</p>
      </div>

      {/* Glassy kart (navbar seviyesinde opak) */}
      <div className="rounded-2xl border border-white/15 bg-white/[0.08] backdrop-blur-md text-zinc-100 shadow-2xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* E-posta */}
          <div>
            <label htmlFor="email" className="block text-sm text-zinc-200 mb-1">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-zinc-300/70 outline-none focus:ring-2 focus:ring-white/25"
              placeholder="ornek@posta.com"
              required
            />
          </div>

          {/* Şifre */}
          <div>
            <label htmlFor="password" className="block text-sm text-zinc-200 mb-1">
              Şifre
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 pr-10 text-sm text-white placeholder-zinc-300/70 outline-none focus:ring-2 focus:ring-white/25"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-2 grid place-items-center px-2 text-zinc-200/80 hover:text-white"
                aria-label={showPw ? "Şifreyi gizle" : "Şifreyi göster"}
              >
                {showPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" className="fill-current"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" className="fill-current"><path d="M3.53 2.47 2.47 3.53 6.3 7.36C4.06 8.64 2.62 10.4 2 12c0 0 3.5 7 10 7 2.08 0 3.87-.6 5.38-1.5l3.09 3.03 1.06-1.06L3.53 2.47ZM12 17c-4.34 0-7.18-3.21-8.39-5 .54-.82 1.64-2.19 3.32-3.31l2.02 1.98A4 4 0 0 0 12 16a3.98 3.98 0 0 0 3.32-1.77l1.56 1.53C15.53 16.58 13.98 17 12 17Zm0-10c4.34 0 7.18 3.21 8.39 5-.39.6-1.12 1.56-2.2 2.46l-1.4-1.37A4 4 0 0 0 12 8c-.44 0-.86.07-1.25.21L9.2 6.66C10.02 6.24 10.97 6 12 6Z"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* Hata */}
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
              {error}
            </div>
          )}

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-xl font-medium px-4 py-2 transition ${
              loading
                ? "bg-white/20 text-zinc-300 cursor-not-allowed"
                : "bg-white text-zinc-900 hover:bg-zinc-200"
            }`}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        {/* Switch */}
        <p className="text-sm text-center mt-4 text-zinc-200/80">
          Hesabınız yok mu?{" "}
          <button onClick={switchToRegister} className="text-white underline decoration-white/50 hover:decoration-white">
            Kayıt Ol
          </button>
        </p>
      </div>
    </div>
  );
}
