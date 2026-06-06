import { sendWhatsAppDocument, documentUrlIsWhatsAppReady } from "./whatsappService.js";
import { getCaProfile } from "./accountsReportService.js";

/* ------------------------------------------------------------------ */
/* Email via nodemailer (SMTP). Degrades gracefully when unconfigured. */
/* ------------------------------------------------------------------ */
function smtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  };
}

export function getEmailConfigStatus() {
  const c = smtpConfig();
  return { configured: Boolean(c.host && c.user && c.pass), host: c.host || null, from: c.from || null };
}

let cachedTransport = null;
async function getTransport() {
  const c = smtpConfig();
  if (!c.host || !c.user || !c.pass) return null;
  if (cachedTransport) return cachedTransport;
  const nodemailer = (await import("nodemailer")).default;
  cachedTransport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
  });
  return cachedTransport;
}

/**
 * Email one or more report PDFs to the CA.
 * @param {object} opts
 * @param {string} [opts.to] override recipient; defaults to CA profile email
 * @param {Array<{title:string,filePath:string,fileName:string}>} opts.attachments
 */
export async function emailReportsToCa({ to, subject, message, attachments = [], tenant }) {
  const transport = await getTransport();
  const ca = await getCaProfile(tenant);
  const recipient = to || ca.email;
  if (!recipient) {
    return { sent: false, configured: getEmailConfigStatus().configured, error: "No CA email on file. Set it in CA Profile." };
  }
  if (!transport) {
    return {
      sent: false,
      configured: false,
      error: "Email (SMTP) not configured",
      message: "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env",
    };
  }
  const c = smtpConfig();
  try {
    const info = await transport.sendMail({
      from: c.from,
      to: recipient,
      subject: subject || "BatteryMela ERP — Accounting Reports",
      text: message || `Dear ${ca.caName || "CA"},\n\nPlease find the attached accounting reports from BatteryMela ERP.\n\nRegards,\nBatteryMela Accounts`,
      attachments: attachments.map((a) => ({ filename: `${(a.title || a.fileName).replace(/[^0-9A-Za-z ]/g, "")}.pdf`, path: a.filePath })),
    });
    console.log("[ca-delivery] Email sent to", recipient, "id:", info.messageId);
    return { sent: true, configured: true, to: recipient, messageId: info.messageId, attachments: attachments.length };
  } catch (err) {
    console.error("[ca-delivery] Email failed:", err.message);
    return { sent: false, configured: true, to: recipient, error: err.message };
  }
}

/**
 * WhatsApp a report PDF to the CA. Requires a public HTTPS URL
 * (PUBLIC_BASE_URL set to ngrok/deployment) — same constraint as quotations.
 */
export async function whatsappReportToCa({ to, publicUrl, fileName, caption, tenant }) {
  const ca = await getCaProfile(tenant);
  const recipient = to || ca.mobile;
  if (!recipient) {
    return { sent: false, error: "No CA mobile on file. Set it in CA Profile." };
  }
  if (!documentUrlIsWhatsAppReady(publicUrl)) {
    return {
      sent: false,
      error: "Report URL must be public HTTPS (not localhost). Set PUBLIC_BASE_URL to an ngrok/deployment URL.",
    };
  }
  return sendWhatsAppDocument({
    to: recipient,
    documentUrl: publicUrl,
    caption: caption || `BatteryMela ERP accounting report${ca.caName ? ` for ${ca.caName}` : ""}.`,
    filename: fileName || "report.pdf",
  });
}
