"use client";

import { useEffect, useMemo, useState } from "react";

type Step = 0 | 1 | 2;
type Format = "video" | "audio";
type DayCell = { d: number; iso?: string; disabled?: boolean; isToday?: boolean };

function toISO(y: number, m: number, d: number) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
function monthMatrix(year: number, month: number, closed: Set<string>): DayCell[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const offset = (first.getDay() + 6) % 7; // Pazartesi=0
  const cells: DayCell[] = [];
  for (let i = 0; i < offset; i++) cells.push({ d: 0 });
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = toISO(year, month, d);
    const disabled = closed.has(iso);
    const t = new Date();
    const isToday = t.getFullYear() === year && t.getMonth() === month && t.getDate() === d;
    cells.push({ d, iso, disabled, isToday });
  }
  return cells;
}
function slotsFor(dateISO: string): string[] {
  if (!dateISO) return [];
  // Örnek (demo) kapalı gün:
  if (dateISO === "2025-09-12") return [];
  const day = new Date(dateISO).getDay(); // 0=Pazar
  const weekend = day === 0 || day === 6;
  return weekend
    ? ["11:00", "13:30", "15:00"]
    : ["10:30", "11:30", "14:30", "15:30", "16:30", "18:00"];
}
function slugToName(slug?: string | null) {
  if (!slug) return "Avukat";
  if (slug.startsWith("avukat-")) {
    const rest = slug
      .replace("avukat-", "")
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    return `Av. ${rest}`;
  }
  return "Avukat";
}

export default function BookingModal() {
  const [open, setOpen] = useState(false);

  // Jenerik avukat bilgisi (linkten okuyoruz)
  const [lawyerName, setLawyerName] = useState("Avukat");
  const [price, setPrice] = useState<number>(3000);

  // Adımlar
  const [step, setStep] = useState<Step>(0);
  const [format, setFormat] = useState<Format>("video");

  // Takvim
  const now = new Date();
  const [viewY, setViewY] = useState(now.getFullYear());
  const [viewM, setViewM] = useState(now.getMonth()); // 0..11
  const [dateISO, setDateISO] = useState("");
  const [time, setTime] = useState("");

  // Onay formu
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [kvkk, setKvkk] = useState(false);

  // Kapalı günler (demo). Gerçekte API'den gelecek.
  const closed = useMemo(() => new Set<string>(["2025-09-12"]), []);
  const cells = useMemo(() => monthMatrix(viewY, viewM, closed), [viewY, viewM, closed]);
  const monthLabel = useMemo(
    () => new Date(viewY, viewM, 1).toLocaleDateString("tr-TR", { year: "numeric", month: "long" }),
    [viewY, viewM]
  );
  const times = useMemo(() => (dateISO ? slotsFor(dateISO) : []), [dateISO]);

  // Kart/Profil içindeki tüm <a href="/randevu/..."> linklerini otomatik yakalar
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a[href^='/randevu/']") as HTMLAnchorElement | null;
      if (!link) return;
      e.preventDefault();

      // Öncelik data-*; yoksa slug'tan isim üret; fiyat default 3000
      const nm = link.dataset.lawyer || slugToName(link.pathname.split("/").pop());
      const pr = Number(link.dataset.price || "") || 3000;
      setLawyerName(nm);
      setPrice(pr);

      // Reset
      const t = new Date();
      setViewY(t.getFullYear());
      setViewM(t.getMonth());
      setDateISO("");
      setTime("");
      setFormat("video");
      setPhone("");
      setOtp("");
      setOtpSent(false);
      setKvkk(false);
      setStep(0);
      setOpen(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!open) return null;

  const Block: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06]">{children}</div>
  );

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div className="relative mx-4 w-full max-w-3xl rounded-[22px] p-[1.2px] bg-[conic-gradient(from_210deg,rgba(0,0,0,0.6),rgba(37,99,235,0.55)_28%,rgba(0,0,0,0.58)_56%,rgba(37,99,235,0.2)_82%,rgba(0,0,0,0.6))] shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <div className="overflow-hidden rounded-[21px] border border-white/10 bg-[#070C17]/92 backdrop-blur-xl">
          {/* Kapak */}
          <div className="relative h-20 sm:h-24 md:h-28">
            <div className="absolute inset-0 bg-[radial-gradient(900px_240px_at_50%_-40%,rgba(37,99,235,0.40),transparent_60%),radial-gradient(420px_220px_at_12%_22%,rgba(37,99,235,0.16),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
          </div>

          <div className="p-6">
            {/* Header */}
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white font-semibold text-black">
                {lawyerName.replace("Av. ", "").charAt(0) || "A"}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{lawyerName}</div>
                <div className="text-xs text-zinc-300">{price.toLocaleString("tr-TR")} ₺ / 30 dk</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="ml-auto rounded-full p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Adım göstergesi */}
            <div className="mb-5 flex items-center justify-between text-xs text-zinc-300">
              {["Görüşme Formatı", "Görüşme Zamanı", "Randevu Onay"].map((s, i) => (
                <div key={s} className="flex flex-1 items-center">
                  <div
                    className={`grid size-7 place-items-center rounded-full border ${
                      i === step ? "border-white bg-white text-black" : "border-white/30 text-white"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className={`ml-2 ${i === step ? "text-white font-medium" : ""}`}>{s}</span>
                  {i < 2 && <div className="mx-2 h-px flex-1 bg-white/15" />}
                </div>
              ))}
            </div>

            {/* STEP 0 */}
            {step === 0 && (
              <div className="space-y-4">
                <Block>
                  <button
                    onClick={() => setFormat("video")}
                    className={`w-full rounded-2xl p-4 text-left ${format === "video" ? "bg-white/5" : ""}`}
                  >
                    <div className="font-medium text-white">Video Görüşme</div>
                    <div className="text-sm text-zinc-300">30 dk / {price.toLocaleString("tr-TR")} ₺</div>
                    <p className="mt-1.5 text-[13px] text-zinc-400">
                      Görüntülü görüşmeler panel üzerinden yapılır; ek uygulama gerekmez.
                    </p>
                  </button>
                </Block>
                <Block>
                  <button
                    onClick={() => setFormat("audio")}
                    className={`w-full rounded-2xl p-4 text-left ${format === "audio" ? "bg-white/5" : ""}`}
                  >
                    <div className="font-medium text-white">Sesli Görüşme</div>
                    <div className="text-sm text-zinc-300">30 dk / {price.toLocaleString("tr-TR")} ₺</div>
                    <p className="mt-1.5 text-[13px] text-zinc-400">Sesli görüşmede sabit hat/WhatsApp kullanılır.</p>
                  </button>
                </Block>

                <div className="flex justify-end">
                  <button onClick={() => setStep(1)} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">
                    Sonraki Adım
                  </button>
                </div>
              </div>
            )}

            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr,1fr]">
                  {/* Takvim */}
                  <Block>
                    <div className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <button
                          className="rounded-lg border border-white/15 px-2 py-1 text-zinc-200 hover:bg-white/10"
                          onClick={() => {
                            const nm = new Date(viewY, viewM - 1, 1);
                            setViewY(nm.getFullYear());
                            setViewM(nm.getMonth());
                          }}
                        >
                          ←
                        </button>
                        <div className="font-medium text-white">{monthLabel.toUpperCase()}</div>
                        <button
                          className="rounded-lg border border-white/15 px-2 py-1 text-zinc-200 hover:bg-white/10"
                          onClick={() => {
                            const nm = new Date(viewY, viewM + 1, 1);
                            setViewY(nm.getFullYear());
                            setViewM(nm.getMonth());
                          }}
                        >
                          →
                        </button>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-[11px] text-zinc-400">
                        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((w) => (
                          <div key={w} className="py-1 text-center">
                            {w}
                          </div>
                        ))}
                      </div>

                      <div className="mt-1 grid grid-cols-7 gap-1">
                        {cells.map((c, i) =>
                          c.d === 0 ? (
                            <div key={i} />
                          ) : (
                            <button
                              key={i}
                              disabled={c.disabled}
                              onClick={() => {
                                setDateISO(c.iso!);
                                setTime("");
                              }}
                              className={`aspect-square rounded-lg border text-sm ${
                                c.disabled
                                  ? "cursor-not-allowed border-white/10 bg-white/5 text-zinc-500 line-through"
                                  : dateISO === c.iso
                                  ? "border-white bg-white/10 text-white"
                                  : "border-white/10 text-zinc-200 hover:bg-white/10"
                              } ${c.isToday ? "ring-1 ring-white/30" : ""}`}
                            >
                              {c.d}
                            </button>
                          )
                        )}
                      </div>

                      {dateISO && closed.has(dateISO) && (
                        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                          {new Date(dateISO).toLocaleDateString("tr-TR")} tarihi randevu alımına kapalı! Lütfen başka bir
                          tarih seçin.
                        </div>
                      )}
                    </div>
                  </Block>

                  {/* Saatler */}
                  <Block>
                    <div className="p-4">
                      <div className="mb-2 text-sm text-zinc-300">Görüşme Saati</div>
                      <div className="flex flex-wrap gap-2">
                        {(times.length ? times : ["Uygun saat yok"]).map((s) =>
                          times.length ? (
                            <button
                              key={s}
                              onClick={() => setTime(s)}
                              className={`rounded-lg border px-3 py-1.5 text-sm ${
                                time === s ? "border-white bg-white/10 text-white" : "border-white/10 text-zinc-200"
                              } hover:bg-white/10`}
                            >
                              {s}
                            </button>
                          ) : (
                            <span key={s} className="text-sm text-zinc-400">
                              {s}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </Block>
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(0)}
                    className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-zinc-100"
                  >
                    Geri
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!dateISO || !time || closed.has(dateISO)}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Sonraki Adım
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  // Burada gerçek API çağrısı yapılacak
                  alert(`Randevu (mock): ${lawyerName} • ${format === "video" ? "Video" : "Sesli"} • ${dateISO} ${time}`);
                  setOpen(false);
                }}
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Telefon"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setOtpSent(true)}
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-zinc-100"
                  >
                    Şifre Al
                  </button>
                </div>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Şifre"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
                  required={otpSent}
                />

                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[13px] text-zinc-300">
                  Online danışmanlık iptal/erteleme talepleri randevu saatinden en geç 30 dk önce bildirilmelidir.
                  KVKK Politikası ve Açık Rıza Metni’ni okudum, onaylıyorum.
                </div>

                <label className="flex items-start gap-2 text-sm text-zinc-200">
                  <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
                  <span>KVKK ve Açık Rıza metnini onaylıyorum.</span>
                </label>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-zinc-100"
                  >
                    Geri
                  </button>
                  <button
                    type="submit"
                    disabled={!kvkk || !phone || !otp}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Randevu Oluştur
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
