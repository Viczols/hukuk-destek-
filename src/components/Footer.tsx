export default function Footer() {
  return (
<footer className="relative mt-0 text-zinc-300 bg-gradient-to-b from-zinc-850 to-zinc-950">
  <div className="absolute -top-px inset-x-0 h-px bg-white/10" />
   <div className="absolute top-0 inset-x-0 h-px bg-white/15" />

      <div className="relative max-w-6xl mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div>
            <h4 className="font-semibold mb-3 text-white tracking-wide">Site</h4>
            <ul className="space-y-2">
              <li><a href="/hakkimizda" className="hover:text-white transition-colors">Hakkımızda</a></li>
              <li><a href="/iletisim" className="hover:text-white transition-colors">İletişim</a></li>
              <li><a href="#paketler" className="hover:text-white transition-colors">Paketler</a></li>
              <li><a href="#blog" className="hover:text-white transition-colors">Blog</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white tracking-wide">Yasal</h4>
            <ul className="space-y-2">
              <li><a href="/kvkk" className="hover:text-white transition-colors">KVKK Politikası</a></li>
              <li><a href="/gizlilik" className="hover:text-white transition-colors">Gizlilik Politikası</a></li>
              <li><a href="/kullanim-kosullari" className="hover:text-white transition-colors">Kullanım Koşulları</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white tracking-wide">Bize Ulaşın</h4>
            <ul className="space-y-2">
              <li><a href="mailto:destek@hukuksite.com" className="hover:text-white transition-colors">destek@hukuksite.com</a></li>
              <li><a href="tel:+902121234567" className="hover:text-white transition-colors">0 (212) 123 45 67</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white tracking-wide">Güncellemeleri Al</h4>
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="email"
                required
                placeholder="E-posta adresiniz"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-400 outline-none focus:ring-2 focus:ring-white/20"
              />
              <button
                className="shrink-0 rounded-xl bg-gradient-to-r from-zinc-700 to-zinc-500 text-white px-4 py-2 text-sm font-medium hover:from-zinc-600 hover:to-zinc-400 transition"
              >
                Abone Ol
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <div>© {new Date().getFullYear()} Hukuk Destek Sistemi. Tüm hakları saklıdır.</div>
        </div>
      </div>
    </footer>
  );
}
