"use client";

import { useState } from "react";
import { registerUser } from "../firebase/authService";
import { getFirestore, doc, setDoc } from "firebase/firestore";

interface Props {
  switchToLogin: () => void;
  onSuccess?: () => void; // ✅ modal kapanma desteği
}

export default function RegisterForm({ switchToLogin, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userCredential = await registerUser(email, password);

      // Firestore'a kullanıcı ekle (varsayılan rol: client)
      const db = getFirestore();
      await setDoc(doc(db, "users", userCredential.user.uid), {
        email: email,
        role: "client",
      });

      // ✅ Modal kapatma
      if (onSuccess) {
        onSuccess();
      }

    } catch (err: any) {
      setError(err.message || "Bir hata oluştu.");
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-blue-700 mb-4 text-center">Kayıt Ol</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded"
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 border rounded"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          Kayıt Ol
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <p className="text-sm text-center mt-4">
        Hesabınız var mı?{" "}
        <button className="text-blue-600 hover:underline" onClick={switchToLogin}>
          Giriş Yap
        </button>
      </p>
    </div>
  );
}
