const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Ensure PDFs directory exists
const pdfDir = path.join(__dirname, '../../pdfs');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

async function generateQuotationPDF(quotationData) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Generate HTML for quotation
    const html = generateQuotationHTML(quotationData);

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const fileName = `quotation-${quotationData.quotationNumber || Date.now()}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    await browser.close();

    return {
      success: true,
      pdfUrl: `/pdfs/${fileName}`,
      filePath
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error('PDF Generation Error:', error);
    throw error;
  }
}

function generateQuotationHTML(data) {
  const options = data.suggestedOptions || [];
  const selected = options.find(o => o.optionId === data.selectedOptionId) || options[0];
  const flatRule = data.flatRule || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quotation - ${data.quotationNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #08235b; padding-bottom: 20px; }
    .logo h1 { color: #08235b; font-size: 28px; font-weight: 800; }
    .logo span { color: #dc2626; }
    .logo p { color: #666; font-size: 12px; margin-top: 5px; }
    .quote-info { text-align: right; }
    .quote-badge { background: #08235b; color: white; padding: 8px 16px; font-weight: bold; border-radius: 5px; display: inline-block; }
    .quote-meta { margin-top: 10px; font-size: 12px; color: #666; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
    .info-box { border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f9fafb; }
    .info-title { background: #08235b; color: white; padding: 5px 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 4px; display: inline-block; margin-bottom: 10px; }
    .info-row { display: grid; grid-template-columns: 120px 10px 1fr; gap: 5px; font-size: 12px; margin: 5px 0; }
    .options-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
    .option-card { border: 2px solid #ddd; border-radius: 8px; padding: 15px; position: relative; }
    .option-card.selected { border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2); }
    .option-title { text-align: center; font-weight: bold; font-size: 14px; text-transform: uppercase; padding-bottom: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px; }
    .product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
    .product-label { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #666; }
    .product-name { font-size: 12px; font-weight: 600; }
    .option-meta { border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px; font-size: 11px; }
    .option-total { text-align: center; font-size: 20px; font-weight: 900; margin-top: 10px; }
    .option-note { margin-top: 10px; font-size: 11px; background: #f8fafc; padding: 8px; border-radius: 5px; border: 1px solid #e2e8f0; }
    .summary { display: grid; grid-template-columns: 1.1fr 1fr; gap: 20px; margin-top: 20px; }
    .summary table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .summary th { background: #f3f4f6; padding: 8px; text-align: left; font-weight: bold; color: #08235b; }
    .summary td { padding: 8px; border-bottom: 1px solid #eee; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #666; text-align: center; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <h1>POWER<span>TECH</span> BATTERIES</h1>
        <p>Powering Your Home, Empowering Your Life</p>
      </div>
      <div class="quote-info">
        <div class="quote-badge">QUOTATION</div>
        <div class="quote-meta">${data.quotationNumber}</div>
        <div class="quote-meta">Date: ${new Date(data.createdAt).toLocaleDateString('en-IN')}</div>
        <div class="quote-meta">Valid till: ${new Date(data.validTill).toLocaleDateString('en-IN')}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="info-title">Customer Details</div>
        <div class="info-row"><span>Name</span><span>:</span><strong>${data.customerName}</strong></div>
        <div class="info-row"><span>Phone</span><span>:</span><strong>${data.customerPhone}</strong></div>
        <div class="info-row"><span>Flat Type</span><span>:</span><strong>${data.flatType}</strong></div>
        <div class="info-row"><span>Backup</span><span>:</span><strong>${data.backupHours} Hours</strong></div>
      </div>
      <div class="info-box">
        <div class="info-title">Load Summary</div>
        <div class="info-row"><span>Total Load</span><span>:</span><strong>~${flatRule.load || 'N/A'} Watts</strong></div>
        <div class="info-row"><span>Inverter</span><span>:</span><strong>${flatRule.inverterRange || 'N/A'}</strong></div>
        <div class="info-row"><span>Battery</span><span>:</span><strong>${flatRule.batteryRange || 'N/A'}</strong></div>
        <div class="info-row"><span>Budget</span><span>:</span><strong>${data.budgetType}</strong></div>
      </div>
      <div class="info-box">
        <div class="info-title">Quotation Info</div>
        <div class="info-row"><span>Prepared By</span><span>:</span><strong>${data.preparedBy || 'Sales Executive'}</strong></div>
        <div class="info-row"><span>Status</span><span>:</span><strong>${data.status}</strong></div>
        <div class="info-row"><span>WhatsApp</span><span>:</span><strong>${data.whatsappSent ? 'Sent' : 'Ready to send'}</strong></div>
      </div>
    </div>

    ${options.length > 3 ? '<div class="page-break"></div>' : ''}
    <div class="options-grid">
      ${options.map((opt, i) => `
        <div class="option-card ${selected?.optionId === opt.optionId ? 'selected' : ''}">
          <div class="option-title" style="color: ${opt.color}">${opt.optionId.replace('OPT-', 'Option ')} - ${opt.type}</div>
          <div class="product-grid">
            <div>
              <div class="product-label">Inverter</div>
              <div class="product-name">${opt.inverterName}</div>
              <div style="font-size: 11px; color: #666;">${opt.inverterVA} VA</div>
            </div>
            <div>
              <div class="product-label">Battery</div>
              <div class="product-name">${opt.batteryName}</div>
              <div style="font-size: 11px; color: #666;">${opt.batteryAh} Ah</div>
            </div>
          </div>
          <div class="option-meta">Backup: ${opt.backup}</div>
          <div class="option-meta">Warranty: ${opt.warranty}</div>
          <div class="option-meta">Suitable For: ${opt.suitableFor}</div>
          <div class="option-total" style="color: ${opt.color}">₹${opt.total.toLocaleString('en-IN')}</div>
          <div class="option-note">${opt.note}</div>
          ${opt.alerts && opt.alerts.length ? opt.alerts.map(a => `<div style="font-size: 10px; color: #b45309; background: #fffbeb; padding: 4px; margin-top: 5px; border-radius: 3px;">⚠ ${a}</div>`).join('') : ''}
        </div>
      `).join('')}
    </div>

    <div class="summary">
      <div>
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Inverter</th>
              <th>Battery</th>
              <th>Backup</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            ${options.map(opt => `
              <tr>
                <td>${opt.type}</td>
                <td>${opt.inverterVA} VA</td>
                <td>${opt.batteryAh} Ah</td>
                <td>${opt.backup}</td>
                <td>₹${opt.total.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="option-note" style="text-align: center; display: flex; align-items: center; justify-content: center; font-size: 13px;">
        <strong>Our recommendation</strong><br />
        ${selected?.type}: ${selected?.inverterName} + ${selected?.batteryName}<br />
        ${selected?.note}
      </div>
    </div>

    <div class="footer">
      <p>Thank you for your enquiry · Prices subject to change · Terms & Conditions apply</p>
      <p>Sharma Battery Store · Pune, Maharashtra · GST: 27XXXXX1234Z1</p>
    </div>
  </div>
</body>
</html>
  `;
}

async function generateInvoicePDF(invoiceData) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const html = generateInvoiceHTML(invoiceData);

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const fileName = `invoice-${invoiceData.invoiceNumber}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    await browser.close();

    return {
      success: true,
      pdfUrl: `/pdfs/${fileName}`,
      filePath
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error('Invoice PDF Generation Error:', error);
    throw error;
  }
}

function generateInvoiceHTML(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${data.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; color: #333; }
    .container { max-width: 700px; margin: 0 auto; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
    .shop-name { font-size: 24px; font-weight: bold; color: #333; }
    .shop-details { font-size: 12px; color: #666; margin-top: 5px; }
    .invoice-meta { text-align: right; }
    .invoice-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-number { font-size: 20px; font-weight: bold; color: #333; }
    .invoice-date { font-size: 12px; color: #666; margin-top: 5px; }
    .bill-to { background: #f9fafb; border-radius: 8px; padding: 15px; margin-bottom: 25px; border: 1px solid #e5e7eb; }
    .bill-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
    .bill-name { font-size: 16px; font-weight: bold; color: #333; }
    .bill-details { font-size: 12px; color: #666; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    th { background: #f3f4f6; color: #374151; padding: 12px; text-align: left; font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-box { width: 250px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
    .total-row.grand { font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #333; padding-top: 12px; margin-top: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 12px; color: #666; }
    .status { padding: 5px 12px; border-radius: 5px; font-size: 11px; font-weight: bold; display: inline-block; margin-top: 10px; }
    .status.paid { background: #e6f4ee; color: #1a7a45; }
    .status.unpaid { background: #fce8e8; color: #c0392b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="shop-name">⚡ Sharma Battery Store</div>
        <div class="shop-details">Near Bus Stand, Pune, Maharashtra 411001</div>
        <div class="shop-details">GSTIN: 27XXXXX1234Z1 · Ph: 9876543210</div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-label">Tax Invoice</div>
        <div class="invoice-number">${data.invoiceNumber}</div>
        <div class="invoice-date">Date: ${new Date(data.createdAt).toLocaleDateString('en-IN')}</div>
        <div class="status ${data.paymentStatus.toLowerCase()}">${data.paymentStatus}</div>
      </div>
    </div>

    <div class="bill-to">
      <div class="bill-label">Bill To</div>
      <div class="bill-name">${data.customerDetails.name}</div>
      <div class="bill-details">Ph: ${data.customerDetails.phone}</div>
      ${data.customerDetails.address ? `<div class="bill-details">${data.customerDetails.address}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Product</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${data.products.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${p.modelName}</td>
            <td>${p.quantity}</td>
            <td>₹${p.sellingRate.toLocaleString('en-IN')}</td>
            <td>₹${p.amount.toLocaleString('en-IN')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span>Subtotal</span><span>₹${data.subtotal.toLocaleString('en-IN')}</span></div>
        <div class="total-row"><span>CGST (9%)</span><span>₹${(data.gst / 2).toLocaleString('en-IN')}</span></div>
        <div class="total-row"><span>SGST (9%)</span><span>₹${(data.gst / 2).toLocaleString('en-IN')}</span></div>
        <div class="total-row grand"><span>Grand Total</span><span>₹${data.totalAmount.toLocaleString('en-IN')}</span></div>
      </div>
    </div>

    <div class="footer">
      <div>
        <div style="font-weight: bold; color: #333; margin-bottom: 5px;">Terms & Conditions</div>
        <div>· Battery warranty as per manufacturer policy</div>
        <div>· Old battery exchange available</div>
        <div>· No cash refund. Exchange only.</div>
      </div>
      <div style="text-align: right;">
        <div style="height: 50px;"></div>
        <div style="font-weight: bold; color: #333;">Authorised Signatory</div>
        <div>Sharma Battery Store</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  generateQuotationPDF,
  generateInvoicePDF
};
