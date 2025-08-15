import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const { to, subject, html, pdfUrl } = await req.json();

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });

    const info = await transporter.sendMail({
      from: `"Dilekçe Destek" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments: pdfUrl
        ? [{ filename: "dilekce.pdf", path: pdfUrl }]
        : [],
    });

    return new Response(JSON.stringify({ ok: true, id: info.messageId }), {
      status: 200,
    });
  } catch (e: any) {
    console.error("[sendEmail] error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "mail error" }),
      { status: 500 }
    );
  }
}
