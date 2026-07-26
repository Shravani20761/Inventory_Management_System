import axios from "axios";

function metaGraphBase() {
  const v = process.env.META_GRAPH_API_VERSION || "v22.0";
  const version = v.startsWith("v") ? v : `v${v}`;
  return `https://graph.facebook.com/${version}`;
}

function metaConfig() {
  return {
    token: process.env.META_ACCESS_TOKEN,
    phoneNumberId: process.env.META_PHONE_NUMBER_ID,
    verifyToken: process.env.META_VERIFY_TOKEN,
  };
}

export function getWhatsAppConfigStatus() {
  const { token, phoneNumberId } = metaConfig();
  const v = process.env.META_GRAPH_API_VERSION || "v22.0";
  return {
    configured: Boolean(token && phoneNumberId),
    provider: "meta",
    phoneNumberId: phoneNumberId || null,
    graphApiVersion: v.startsWith("v") ? v : `v${v}`,
  };
}

export function verifyMetaWebhook(mode, token, challenge) {
  const { verifyToken } = metaConfig();
  if (mode === "subscribe" && token === verifyToken) {
    return challenge;
  }
  return null;
}

/** E.164 without + — Meta Cloud API expects digits only with country code. */
export function normalizePhone(to) {
  let digits = String(to).replace(/\D/g, "");
  if (!digits) return null;
  // Leading 00 → international prefix
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  if (digits.length === 10) {
    const d0 = digits[0];
    // Indian mobile typically 6–9; US/others often start with 2–5 for area codes — avoid forcing 91 on 10-digit US
    if (d0 === "6" || d0 === "7" || d0 === "8" || d0 === "9") return `91${digits}`;
    return digits;
  }
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

/** Meta must fetch the file over HTTPS from a public host (not localhost / LAN). */
export function documentUrlIsWhatsAppReady(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim().toLowerCase();
  if (!u.startsWith("https://")) return false;
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost" || hostname === "127.0.0.1") return false;
    if (/^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function metaRequest(phoneNumberId, token, body) {
  const url = `${metaGraphBase()}/${phoneNumberId}/messages`;
  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    validateStatus: () => true,
  });
  return res;
}

/**
 * Send WhatsApp document via Meta Cloud API.
 * documentUrl must be publicly reachable HTTPS (quotations: PUBLIC_BASE_URL/generated/... or Cloudinary for invoices).
 */
export async function sendWhatsAppDocument({ to, documentUrl, caption, filename = "document.pdf" }) {
  const { token, phoneNumberId } = metaConfig();
  const phone = normalizePhone(to);

  if (!phone) {
    return { sent: false, configured: true, error: "Invalid customer phone number" };
  }

  if (!token || !phoneNumberId) {
    return {
      sent: false,
      configured: false,
      error: "Meta WhatsApp not configured",
      message: "Set META_ACCESS_TOKEN and META_PHONE_NUMBER_ID in .env",
    };
  }

  if (!documentUrl) {
    return { sent: false, configured: true, error: "Document URL is missing" };
  }

  if (!documentUrlIsWhatsAppReady(documentUrl)) {
    const hint =
      "Meta cannot download this URL. Use HTTPS and a public host: set PUBLIC_BASE_URL to ngrok (or deploy), or configure Cloudinary so quotation PDFs upload automatically for WhatsApp.";
    console.error("[whatsapp] Rejecting document URL (not public HTTPS):", documentUrl);
    return {
      sent: false,
      configured: true,
      provider: "meta",
      error: "Document URL must be public HTTPS (not localhost or http)",
      hint,
    };
  }

  console.log("[whatsapp] Sending document to", phone, "→", documentUrl);

  try {
    const docBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "document",
      document: {
        link: documentUrl,
        caption: (caption || "Your document from Sharma Battery Store").slice(0, 1024),
        filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      },
    };

    const docRes = await metaRequest(phoneNumberId, token, docBody);

    if (docRes.status >= 400) {
      const errObj = docRes.data?.error;
      const msg = errObj?.message || errObj?.error_user_msg || `Meta API error ${docRes.status}`;
      console.error("[whatsapp] Send failed (full Meta response):", JSON.stringify(docRes.data, null, 2));
      return {
        sent: false,
        configured: true,
        provider: "meta",
        error: msg,
        details: errObj,
        hint: buildMetaErrorHint(msg, errObj),
      };
    }

    const messageId = docRes.data?.messages?.[0]?.id;
    console.log("[whatsapp] Document sent OK, message id:", messageId, "| contacts:", docRes.data?.contacts?.length ?? 0);
    return { sent: true, configured: true, provider: "meta", messageId, mediaUrl: documentUrl };
  } catch (err) {
    const body = err.response?.data;
    const msg = body?.error?.message || err.message || "WhatsApp send failed";
    console.error("[whatsapp] Request error:", msg, body ? JSON.stringify(body, null, 2) : "");
    return { sent: false, configured: true, provider: "meta", error: msg, details: body?.error };
  }
}

function buildMetaErrorHint(message, errObj) {
  const msg = String(message || "");
  if (/url|download|media|fetch|invalid parameter/i.test(msg)) {
    return "PDF link must be public HTTPS. Use ngrok PUBLIC_BASE_URL or Cloudinary (quotations auto-upload when Cloudinary is configured).";
  }
  if (/not registered|recipient|131030|131026/i.test(msg) || errObj?.code === 131026) {
    return "In development, add the recipient number in Meta → WhatsApp → API setup → \"To\" field / test recipients. Customer must have opted in / be allowed.";
  }
  if (/token|190|OAuth|session/i.test(msg)) {
    return "Regenerate META_ACCESS_TOKEN in Meta Developer (long-lived token) and update .env.";
  }
  if (/phone number id|132001|80007/i.test(msg)) {
    return "Verify META_PHONE_NUMBER_ID matches WhatsApp → API Setup in Meta dashboard.";
  }
  return undefined;
}

export async function sendQuotationWhatsApp({ to, customerName, publicUrl, fileName, optionCount }) {
  const caption = `Hello ${customerName || "Customer"},\n\nYour battery & inverter quotation (${optionCount || ""} options) from Sharma Battery Store / POWERTECH is attached.\n\nThank you!`;
  return sendWhatsAppDocument({
    to,
    documentUrl: publicUrl,
    caption,
    filename: fileName || "quotation.pdf",
  });
}

/** Recommendation sheet (Stage 1) — multi-option comparison PDF. */
export async function sendRecommendationSheetWhatsApp({ to, customerName, publicUrl, fileName, optionCount, sheetKey }) {
  const ref = sheetKey ? ` (${sheetKey})` : "";
  const caption = `Hello ${customerName || "Customer"},\n\nYour *Power Backup Recommendation Sheet*${ref} from *BatteryMela* is attached.\n\nWe have shared ${optionCount || "several"} package option(s) for your review. Please choose one option and we will prepare your final quotation.\n\nThank you!`;
  return sendWhatsAppDocument({
    to,
    documentUrl: publicUrl,
    caption,
    filename: fileName || "recommendation-sheet.pdf",
  });
}

export async function sendInvoiceWhatsApp({ to, customerName, invoiceNumber, totalAmount, cloudinaryUrl }) {
  const caption = `Hello ${customerName || "Customer"},\n\nYour tax invoice *${invoiceNumber}* is ready.\nTotal: *Rs ${Number(totalAmount).toLocaleString("en-IN")}*\n\n— Sharma Battery Store`;
  return sendWhatsAppDocument({
    to,
    documentUrl: cloudinaryUrl,
    caption,
    filename: `${invoiceNumber}.pdf`,
  });
}

/** Plain-text WhatsApp message via Meta Cloud API (payment reminders). */
export async function sendWhatsAppText({ to, body }) {
  const { token, phoneNumberId } = metaConfig();
  const phone = normalizePhone(to);
  const text = String(body ?? "").trim().slice(0, 4096);
  if (!phone) return { sent: false, configured: true, error: "Invalid phone number" };
  if (!text) return { sent: false, configured: true, error: "Message body is empty" };
  if (!token || !phoneNumberId) {
    return { sent: false, configured: false, error: "Meta WhatsApp not configured" };
  }
  try {
    const res = await metaRequest(phoneNumberId, token, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { preview_url: false, body: text },
    });
    if (res.status >= 400) {
      const msg = res.data?.error?.message || `Meta API error ${res.status}`;
      return { sent: false, configured: true, error: msg, details: res.data?.error };
    }
    return { sent: true, configured: true, messageId: res.data?.messages?.[0]?.id };
  } catch (err) {
    return { sent: false, configured: true, error: err.message || "WhatsApp send failed" };
  }
}

export async function sendPurchaseReminderWhatsApp({ to, vendorName, amount, dueDate }) {
  const body = `Hello ${vendorName || "Vendor"},

Reminder:
Cheque/payment of ₹${Number(amount).toLocaleString("en-IN")}
is due on ${dueDate || "soon"}.

Please ensure sufficient balance
to avoid cheque bounce.

– BatteryMela ERP`;
  return sendWhatsAppText({ to, body });
}

/** Optional SMS via Twilio when TWILIO_* env vars are set. */
export async function sendSmsReminder({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    return { sent: false, configured: false, error: "Twilio not configured" };
  }
  const phone = normalizePhone(to);
  if (!phone) return { sent: false, configured: true, error: "Invalid phone" };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const params = new URLSearchParams({ To: `+${phone}`, From: from, Body: String(body).slice(0, 1600) });
    const res = await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, params, {
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      return { sent: false, configured: true, error: res.data?.message || `Twilio error ${res.status}` };
    }
    return { sent: true, configured: true, sid: res.data?.sid };
  } catch (err) {
    return { sent: false, configured: true, error: err.message };
  }
}
