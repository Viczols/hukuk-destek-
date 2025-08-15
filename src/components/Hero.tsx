// src/components/Hero.tsx

export default function Hero() {
  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center bg-blue-50 px-4 text-center">
      <h1 className="text-4xl md:text-5xl font-bold text-blue-800 mb-4">
        Yapay Zeka Dilekçenizi Hazırlasın
      </h1>
      <p className="text-lg text-gray-700 mb-6">
        Avukata danışmak mı istiyorsunuz? Hemen başlayın.
      </p>
      <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        Hemen Başla
      </button>
    </section>
  );
}
