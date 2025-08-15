// src/components/Footer.tsx

export default function Footer() {
  return (
    <footer className="bg-blue-900 text-white py-8 mt-20">
      <div className="max-w-6xl mx-auto px-4 grid gap-6 sm:grid-cols-2 md:grid-cols-4 text-sm">
        <div>
          <h4 className="font-semibold mb-2">Site</h4>
          <ul>
            <li><a href="#" className="hover:underline">Hakkımızda</a></li>
            <li><a href="#" className="hover:underline">İletişim</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Yasal</h4>
          <ul>
            <li><a href="#" className="hover:underline">KVKK Politikası</a></li>
            <li><a href="#" className="hover:underline">Gizlilik Politikası</a></li>
          </ul>
        </div>
        <div className="col-span-2">
          <h4 className="font-semibold mb-2">Bize Ulaşın</h4>
          <p>E-posta: destek@hukuksite.com</p>
          <p>Telefon: 0 (212) 123 45 67</p>
        </div>
      </div>
      <div className="text-center text-xs text-gray-300 mt-6">
        © {new Date().getFullYear()} Hukuk Destek Sistemi. Tüm hakları saklıdır.
      </div>
    </footer>
  );
}
