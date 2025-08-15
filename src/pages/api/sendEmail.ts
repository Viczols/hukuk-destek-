import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST || "";
const port = Number(process.env.SMTP_PORT || 465);
const secure = String(process.env.SMTP_SECURE ?? "true") === "true"; // 465 => true
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";
const from =
  process.env.MAIL_FROM || (user ? `no-reply <${user}>` : "no-reply@example.com");

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: user && pass ? { user, pass } : undefined,
});

export async function verifySmtp() {
  if (!host || !user || !pass) {
    console.warn("[sendEmail] SMTP env eksik (host/user/pass). Mail atlanacak.");
    return { ok: false, reason: "missing_env" as const };
  }
  try {
    await transporter.verify();
    return { ok: true as const };
  } catch (e) {
    console.error("[sendEmail] verify hata:", e);
    return { ok: false as const, reason: "verify_failed", error: String(e) };
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  const v = await verifySmtp();
  if (!v.ok) return { ok: false, skipped: true, verify: v };

  try {
    const info = await transporter.sendMail({ from, ...opts });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error("[sendEmail] sendMail hata:", e);
    return { ok: false, error: String(e) };
  }
}
