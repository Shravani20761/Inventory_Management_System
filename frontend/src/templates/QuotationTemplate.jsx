import QuotationCard from "../components/QuotationCard.jsx";
import ComparisonTable from "../components/ComparisonTable.jsx";

/** Dynamic quotation preview (screen) — PDF uses server Puppeteer template */
export default function QuotationTemplate({ quotation, options = [], selectedOption, onSelectOption }) {
  if (!quotation) return null;
  return (
    <div className="space-y-6">
      <header className="rounded-xl bg-gradient-to-r from-slate-900 to-sky-900 p-6 text-white">
        <h1 className="text-2xl font-bold">Quotation for {quotation.customerName}</h1>
        <p className="text-sky-100">
          {quotation.flatType} · {quotation.backupHours}h backup · {quotation.budgetType} · Load ~{quotation.totalLoad}W
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {options.map((opt) => (
          <QuotationCard
            key={opt.optionLabel}
            option={opt}
            selected={selectedOption?.optionLabel === opt.optionLabel}
            onSelect={onSelectOption}
          />
        ))}
      </div>
      <ComparisonTable options={options} />
      {quotation.quotationPdfUrl && (
        <a
          href={quotation.quotationPdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-lg bg-sky-600 px-4 py-2 text-white"
        >
          Download PDF
        </a>
      )}
    </div>
  );
}
