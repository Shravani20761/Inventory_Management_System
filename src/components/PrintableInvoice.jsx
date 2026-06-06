/** Shared A4 invoice document for screen preview + browser print. */
const LOGO_SRC = "/assets/logos/batterymela-logo.png";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function chargeLines(additionalCharges = {}) {
  const labels = {
    inverterInstallation: "Inverter Installation",
    batteryInstallation: "Battery Installation",
    trolleyCharges: "Trolley",
    transportationCharges: "Transportation",
    wiringCharges: "Wiring",
    deliveryCharges: "Delivery",
    serviceCharges: "Service",
    otherCharges: "Other Charges",
  };
  return Object.entries(labels)
    .filter(([key]) => additionalCharges[key]?.enabled && Number(additionalCharges[key]?.amount) > 0)
    .map(([key, label]) => ({ label, amount: Number(additionalCharges[key].amount) }));
}

export function PrintableInvoiceDocument({ invoice, printId = "invoice-print-area" }) {
  const row = invoice;
  const items = row.items ?? row.products ?? [];
  const charges = chargeLines(row.additionalCharges);
  const scrap = Number(row.scrapAdjustment ?? 0);

  return (
    <div id={printId} className="invoice-a4-sheet">
      <div className="invoice-a4-brand-line" />
      <div className="invoice-a4-header">
        <div className="invoice-a4-logo-wrap">
          <img src={LOGO_SRC} alt="BatteryMela" className="invoice-a4-logo" />
        </div>
        <div className="invoice-a4-title">TAX INVOICE</div>
        <div className="invoice-a4-meta">
          <div>
            <span className="invoice-a4-meta-label">Invoice No:</span> <strong>{row.id || row.invoiceNumber}</strong>
          </div>
          {row.quotationId ? (
            <div>
              <span className="invoice-a4-meta-label">Quotation:</span> {row.quotationId}
            </div>
          ) : null}
          <div>
            <span className="invoice-a4-meta-label">Date:</span> {row.date}
          </div>
          <div>
            <span className="invoice-a4-meta-label">GSTIN:</span> 27XXXXX1234Z1
          </div>
          <div className={`invoice-a4-status ${row.paid ? "paid" : "unpaid"}`}>{row.paid ? "PAID" : "UNPAID"}</div>
        </div>
      </div>

      <div className="invoice-a4-section">
        <h3>Bill To</h3>
        <div className="invoice-a4-customer">
          <strong>{row.customer || row.customerDetails?.name}</strong>
          <div>Phone: {row.phone || row.customerDetails?.phone}</div>
          {(row.address || row.customerDetails?.address) && <div>{row.address || row.customerDetails?.address}</div>}
        </div>
      </div>

      {(row.inverter?.model || row.battery?.model) && (
        <div className="invoice-a4-section invoice-a4-specs">
          {row.inverter?.model && (
            <div className="invoice-a4-spec">
              <strong>Inverter</strong>
              <div>
                {row.inverter.brand} {row.inverter.model} · {row.inverter.inverterVA ?? row.calculatedVA} VA
              </div>
            </div>
          )}
          {row.battery?.model && (
            <div className="invoice-a4-spec">
              <strong>Battery</strong>
              <div>
                {row.battery.brand} {row.battery.model} · {row.battery.batteryAH ?? row.calculatedAH} Ah
                {row.battery.batteryType ? ` · ${row.battery.batteryType}` : ""}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="invoice-a4-section">
        <h3>Products</h3>
        <table className="invoice-a4-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Rate (₹)</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it.model ?? it.modelName}</td>
                <td>{it.qty ?? it.quantity ?? 1}</td>
                <td>{fmt(it.rate)}</td>
                <td>{fmt(it.amount ?? (it.qty ?? it.quantity ?? 1) * it.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(charges.length > 0 || scrap > 0) && (
        <div className="invoice-a4-section">
          <h3>Additional Charges</h3>
          <table className="invoice-a4-table">
            <thead>
              <tr>
                <th>Charge Type</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td>{fmt(c.amount)}</td>
                </tr>
              ))}
              {scrap > 0 && (
                <tr>
                  <td>Old Battery Exchange Credit</td>
                  <td style={{ color: "#059669" }}>- {fmt(scrap)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="invoice-a4-totals">
        <div className="invoice-a4-totals-box">
          <div>
            <span>Subtotal</span>
            <span>₹ {fmt(row.subtotal)}</span>
          </div>
          <div>
            <span>GST ({row.gstRate ?? 18}%)</span>
            <span>₹ {fmt(row.gst ?? row.gstAmount)}</span>
          </div>
          <div className="invoice-a4-grand">
            <span>Grand Total</span>
            <span>₹ {fmt(row.total ?? row.totalAmount ?? row.finalTotal)}</span>
          </div>
        </div>
      </div>

      <div className="invoice-a4-footer">Thank you for choosing BatteryMela · +91 98765 43210 · support@batterymela.com</div>
    </div>
  );
}

export function printInvoiceElement(elementId = "invoice-print-area") {
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }
  el.dataset.printActive = "1";
  document.body.classList.add("printing-invoice");
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove("printing-invoice");
    delete el.dataset.printActive;
  }, 500);
}
