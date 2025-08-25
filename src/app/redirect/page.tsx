"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RedirectPage() {
  const params = useSearchParams();
  const router = useRouter();
  const htmlContent = params?.get("html") || "";

  useEffect(() => {
    if (!htmlContent) {
      router.push("/");
    }
  }, [htmlContent, router]);

  if (!htmlContent) {
    return <p>Yönlendirme bilgisi bulunamadı...</p>;
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gray-100">
      <div
        className="bg-white shadow-md rounded p-4 w-full max-w-3xl"
        dangerouslySetInnerHTML={{ __html: atob(htmlContent) }}
      />
    </div>
  );
}
