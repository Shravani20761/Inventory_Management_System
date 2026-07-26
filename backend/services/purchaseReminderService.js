import PurchaseOrder from "../models/PurchaseOrder.js";
import ReminderLog from "../models/ReminderLog.js";
import {
  refreshOverdueStatuses,
} from "./purchaseManagementService.js";
import {
  sendPurchaseReminderWhatsApp,
  sendSmsReminder,
} from "./whatsappService.js";

const REMINDER_DAYS = [7, 3, 1, 0];

function parseDateStr(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  const da = parseDateStr(a);
  const db = parseDateStr(b);
  if (!da || !db) return null;
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function buildReminderMessage(vendorName, amount, dueDate) {
  return `Hello ${vendorName || "Vendor"},

Reminder:
Cheque/payment of ₹${Number(amount).toLocaleString("en-IN")}
is due on ${dueDate || "soon"}.

Please ensure sufficient balance
to avoid cheque bounce.

– BatteryMela ERP`;
}

async function alreadySent({ purchaseOrderId, daysBeforeDue, dueDate, type }) {
  const existing = await ReminderLog.findOne({
    purchaseOrderId,
    daysBeforeDue,
    dueDate,
    type,
    success: true,
  }).lean();
  return Boolean(existing);
}

export async function runPurchaseReminderJob({ dryRun = false } = {}) {
  await refreshOverdueStatuses();
  const today = todayStr();
  const orders = await PurchaseOrder.find({
    outstandingAmount: { $gt: 0 },
    status: "Open",
  }).lean();

  const summary = { checked: orders.length, sent: 0, skipped: 0, errors: [] };

  for (const order of orders) {
    const dueTargets = [];
    if (order.nextDueDate) {
      dueTargets.push({ dueDate: order.nextDueDate, amount: order.outstandingAmount, label: "payment" });
    }
    for (const ch of order.cheques || []) {
      if (ch.status === "Cleared" || ch.status === "Cancelled") continue;
      if (ch.dueDate) dueTargets.push({ dueDate: ch.dueDate, amount: ch.amount, label: "cheque" });
    }
    const phone = order.vendorWhatsApp || order.vendorMobile;
    for (const target of dueTargets) {
      const diff = daysBetween(today, target.dueDate);
      if (diff == null || !REMINDER_DAYS.includes(diff)) continue;
      const sentKey = { purchaseOrderId: order._id, daysBeforeDue: diff, dueDate: target.dueDate, type: "whatsapp" };
      if (await alreadySent(sentKey)) {
        summary.skipped += 1;
        continue;
      }
      const message = buildReminderMessage(order.vendorName, target.amount, target.dueDate);
      if (dryRun) {
        summary.sent += 1;
        continue;
      }
      let wa = { sent: false, error: "No WhatsApp number" };
      if (phone) {
        wa = await sendPurchaseReminderWhatsApp({
          to: phone,
          vendorName: order.vendorName,
          amount: target.amount,
          dueDate: target.dueDate,
        });
      }
      let sms = { sent: false };
      if (process.env.PURCHASE_REMINDER_SMS === "true" && phone) {
        sms = await sendSmsReminder({ to: phone, body: message });
      }
      await ReminderLog.create({
        purchaseOrderId: order._id,
        purchaseId: order.purchaseId,
        branchId: order.branchId,
        vendorName: order.vendorName,
        vendorPhone: phone || "",
        message,
        type: "whatsapp",
        channel: wa.sent ? "whatsapp" : sms.sent ? "sms" : "whatsapp",
        daysBeforeDue: diff,
        dueDate: target.dueDate,
        amount: target.amount,
        success: Boolean(wa.sent || sms.sent),
        error: wa.error || sms.error || "",
      });
      if (wa.sent || sms.sent) summary.sent += 1;
      else summary.errors.push({ purchaseId: order.purchaseId, error: wa.error || sms.error });
    }
  }
  console.log("[purchase-reminders]", summary);
  return summary;
}

let reminderTimer = null;

export function startPurchaseReminderCron() {
  const ms = Number(process.env.PURCHASE_REMINDER_INTERVAL_MS) || 24 * 60 * 60 * 1000;
  if (reminderTimer) clearInterval(reminderTimer);
  const tick = () => {
    runPurchaseReminderJob().catch((err) => console.error("[purchase-reminders] cron error:", err.message));
  };
  setTimeout(tick, 60_000);
  reminderTimer = setInterval(tick, ms);
  console.log(`[purchase-reminders] Daily reminder engine scheduled (every ${Math.round(ms / 3600000)}h)`);
}
