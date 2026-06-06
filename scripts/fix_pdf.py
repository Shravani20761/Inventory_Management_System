from pathlib import Path

p = Path(__file__).resolve().parent.parent / "server" / "services" / "pdfService.js"
t = p.read_text(encoding="utf-8")
start = t.find("function renderInvoiceHtml")
end = t.find("export async function generateInvoicePdf")
new = '''function renderInvoiceHtml(invoice) {
  const items = invoice.products ?? invoice.items ?? [];
  const customer = invoice.customerDetails ?? {};
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:Arial,sans-serif;color:#111;margin:0;padding:32px}
    h1{color:#08235b} table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{border:1px solid #cbd5e1;padding:10px;font-size:13px}
    th{background:#08235b;color:#fff} .totals{margin-top:16px;text-align:right}
    .grand{font-size:20px;font-weight:bold;color:#08235b}
  </style></head><body>
    <h1>Tax Invoice - ${invoice.invoiceNumber ?? invoice.id}</h1>
    <p><strong>${customer.name ?? ""}</strong><br/>${customer.phone ?? ""}</p>
    <table><thead><tr><th>Model</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>
    ${items.map((i) => `<tr><td>${i.modelName}</td><td>${i.quantity}</td><td>Rs ${Number(i.rate).toLocaleString("en-IN")}</td><td>Rs ${Number(i.amount).toLocaleString("en-IN")}</td></tr>`).join("")}
    </tbody></table>
    <div class="totals"><div>Subtotal: Rs ${Number(invoice.subtotal).toLocaleString("en-IN")}</div>
    <motion>GST: Rs ${Number(invoice.gst).toLocaleString("en-IN")}</motion>
    <div class="grand">Total: Rs ${Number(invoice.totalAmount ?? invoice.total).toLocaleString("en-IN")}</motion></motion>
  </body></html>`;
}

'''
# fix accidental motion tags
lines = []
for line in new.split("\n"):
    lines.append(line.replace("<motion", "<div").replace("</motion>", "</div>"))
new = "\n".join(lines)
p.write_text(t[:start] + new + t[end:], encoding="utf-8")
print("fixed")
