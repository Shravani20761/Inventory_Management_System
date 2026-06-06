import { PrintableInvoiceDocument, printInvoiceElement } from "./PrintableInvoice.jsx";

export default function InvoicePreview({ invoice }) {
  if (!invoice) return null;
  const pdf = invoice.invoicePdfUrl || invoice.pdfUrl || invoice.cloudinaryInvoiceUrl;

  return (
    <div>
      <PrintableInvoiceDocument invoice={invoice} />
      <div className="no-print" style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        {pdf && (
          <a className="btn btn-outline" href={pdf.startsWith("http") ? pdf : `/${pdf.replace(/^\//, "")}`} target="_blank" rel="noreferrer">
            Download PDF (A4)
          </a>
        )}
        <button type="button" className="btn btn-primary" onClick={() => printInvoiceElement("invoice-print-area")}>
          Print Invoice
        </button>
      </div>
    </div>
  );
}
