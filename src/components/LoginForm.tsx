"use client";

import { useState } from "react";
import { loginUser } from "../firebase/authService";
import { setLawyerOnline } from "../firebase/presenceService";
import { getFirestore, doc, getDoc } from "firebase/firestore";

interface Props {
  switchToRegister: () => void;
  onSuccess: () => void; // ✅ modalı kapatmak için
}

export default function LoginForm({ switchToRegister, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userCredential = await loginUser(email, password);
      const uid = userCredential.user.uid;

      // Firestore'dan rol kontrolü
      const userDoc = await getDoc(doc(getFirestore(), "users", uid));
      if (userDoc.exists() && userDoc.data().role === "lawyer") {
        setLawyerOnline(uid, userCredential.user.email);
      }

      // ✅ Başarılı girişte modalı kapat
      onSuccess();

    } catch (err: any) {
      setError(err.message || "Bir hata oluştu.");
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-blue-700 mb-4 text-center">Giriş Yap</h2>
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
          Giriş Yap
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <p className="text-sm text-center mt-4">
        Hesabınız yok mu?{" "}
        <button className="text-blue-600 hover:underline" onClick={switchToRegister}>
          Kayıt Ol
        </button>
      </p>
    </div>
  );
}
