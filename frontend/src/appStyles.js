export const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #f4f6f8; color: #111827; min-height: 100vh; font-size: 17px; line-height: 1.55; }
  .app { display: flex; min-height: 100vh; width: 100%; max-width: 100vw; overflow-x: hidden; }
  .sidebar { width: 230px; flex-shrink: 0; background: #ffffff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; position: fixed; left: 0; top: 0; height: 100vh; z-index: 100; overflow-y: auto; }
  .sidebar-logo { padding: 24px 20px 20px; border-bottom: 1px solid #e5e7eb; }
  .logo-text { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; color: #111827; }
  .logo-sub { font-size: 11px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }
  .nav { padding: 16px 12px; flex: 1; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #4b5563; transition: all 0.15s; margin-bottom: 2px; }
  .nav-item:hover { background: #f3f4f6; color: #111827; }
  .nav-item.active { background: #e0f2fe; color: #0284c7; }
  .nav-item i { font-size: 18px; flex-shrink: 0; }
  .main { margin-left: 230px; flex: 1; min-width: 0; width: calc(100% - 230px); padding: 28px 32px 40px; min-height: 100vh; box-sizing: border-box; }
  .main-embedded { margin-left: 0 !important; width: 100% !important; max-width: 100%; min-height: 100%; padding: 28px 32px 40px; box-sizing: border-box; }
  .app-embedded { display: block; width: 100%; max-width: 100%; min-height: 100%; overflow-x: hidden; }
  .page-header { margin-bottom: 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-header > div:last-child { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .page-title { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 700; color: #111827; line-height: 1.2; }
  .page-sub { font-size: 14px; color: #6b7280; margin-top: 4px; line-height: 1.4; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 16px; min-height: 40px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap; box-sizing: border-box; }
  .btn-primary { background: #0ea5e9; color: #fff; }
  .btn-primary:hover { background: #0284c7; }
  .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
  .btn-secondary { background: #ffffff; color: #4b5563; border: 1px solid #e5e7eb; }
  .btn-secondary:hover { background: #f9fafb; border-color: #d1d5db; }
  .btn-danger { background: #ef4444; color: #fff; }
  .btn-danger:hover { background: #dc2626; }
  .btn-sm { padding: 0 10px; min-height: 32px; font-size: 13px; }
  .btn-outline { background: transparent; color: #0ea5e9; border: 1px solid #0ea5e9; }
  .btn-outline:hover { background: #f0f9ff; }
  .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); box-sizing: border-box; width: 100%; max-width: 100%; }
  .stat-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .stat-label { font-size: 15px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 34px; font-weight: 700; color: #111827; }
  .stat-change { font-size: 15px; margin-top: 6px; }
  .stat-change.up { color: #10b981; }
  .stat-change.down { color: #ef4444; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 16px; }
  th { text-align: left; padding: 10px 14px; color: #6b7280; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; color: #374151; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f9fafb; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; line-height: 1.3; }
  .badge-green { background: #d1fae5; color: #059669; }
  .badge-red { background: #fee2e2; color: #dc2626; }
  .badge-yellow { background: #fef3c7; color: #d97706; }
  .badge-blue { background: #e0f2fe; color: #0284c7; }
  .badge-gray { background: #f3f4f6; color: #4b5563; }
  .profit-alert { padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 500; margin-top: 0; line-height: 1.3; }
  .profit-alert.gain { background: #d1fae5; color: #059669; border: 1px solid #a7f3d0; }
  .profit-alert.loss { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }
  .form-group { margin-bottom: 16px; }
  .form-label { font-size: 12px; color: #4b5563; margin-bottom: 6px; display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .form-input { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 12px; min-height: 40px; height: 40px; color: #111827; font-size: 14px; outline: none; transition: border 0.15s; box-sizing: border-box; }
  .form-input:focus { border-color: #0ea5e9; box-shadow: 0 0 0 2px rgba(14,165,233,0.1); }
  .form-select { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 12px; min-height: 40px; height: 40px; color: #111827; font-size: 14px; outline: none; box-sizing: border-box; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.6); display: flex; align-items: center; justify-content: center; z-index: 999; backdrop-filter: blur(2px); }
  .modal { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; width: 680px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #e5e7eb; }
  .modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 700; color: #111827; }
  .modal-body { padding: 24px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; gap: 10px; justify-content: flex-end; background: #f9fafb; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }
  .close-btn { background: #f3f4f6; border: none; color: #6b7280; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .close-btn:hover { background: #e5e7eb; color: #111827; }
  .section-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px; }
  .invoice-preview { background: #fff; color: #111; border-radius: 12px; padding: 40px; font-family: 'DM Sans', sans-serif; border: 1px solid #e5e7eb; }
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .inv-shop-name { font-size: 28px; font-weight: 700; color: #111; }
  .inv-shop-sub { font-size: 15px; color: #666; margin-top: 2px; }
  .inv-meta { text-align: right; }
  .inv-id { font-size: 24px; font-weight: 700; color: #111; }
  .inv-date { font-size: 15px; color: #666; margin-top: 4px; }
  .inv-bill-to { background: #f9fafb; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; border: 1px solid #f3f4f6; }
  .inv-bill-label { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .inv-bill-name { font-size: 18px; font-weight: 600; color: #111; }
  .inv-table { width: 100%; border-collapse: collapse; font-size: 16px; margin-bottom: 24px; }
  .inv-table th { background: #f3f4f6; color: #374151; padding: 10px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; }
  .inv-table td { padding: 10px 12px; border-bottom: 1px solid #eee; color: #333; }
  .inv-totals { display: flex; justify-content: flex-end; }
  .inv-totals-box { width: 220px; }
  .inv-total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 16px; color: #444; }
  .inv-total-row.grand { font-weight: 700; font-size: 20px; color: #111; border-top: 2px solid #111; padding-top: 10px; margin-top: 6px; }
  .search-bar { display: flex; align-items: center; gap: 10px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 14px; min-height: 42px; width: 100%; box-sizing: border-box; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); }
  .search-bar i { color: #9ca3af; font-size: 20px; }
  .search-bar input { background: none; border: none; outline: none; color: #111827; font-size: 14px; padding: 10px 0; flex: 1; min-width: 0; width: 100%; }
  .filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; width: 100%; }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; background: #f3f4f6; border-radius: 10px; padding: 4px; margin-bottom: 16px; width: 100%; box-sizing: border-box; }
  .tab { padding: 8px 14px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; color: #4b5563; transition: all 0.15s; min-height: 36px; display: inline-flex; align-items: center; }
  .tab.active { background: #ffffff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .comparison-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .comparison-title { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 10px; }

  /* A4 invoice sheet — screen preview + print */
  .invoice-a4-sheet {
    width: 210mm;
    min-height: 297mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 12mm 14mm;
    background: #fff;
    color: #111827;
    box-sizing: border-box;
    font-family: 'DM Sans', Segoe UI, Arial, sans-serif;
    border: 1px solid #e5e7eb;
    box-shadow: 0 4px 24px rgba(17, 24, 39, 0.08);
  }
  .invoice-a4-brand-line { height: 4px; background: linear-gradient(90deg, #6B21D8, #7C3AED); border-radius: 2px; margin-bottom: 16px; }
  .invoice-a4-header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; border-bottom: 3px solid #6B21D8; padding-bottom: 14px; margin-bottom: 18px; }
  .invoice-a4-logo-wrap { display: flex; align-items: center; }
  .invoice-a4-logo { width: 220px; max-width: 100%; height: auto; object-fit: contain; display: block; }
  .invoice-a4-title { text-align: center; font-size: 28px; font-weight: 800; color: #6B21D8; letter-spacing: 1px; }
  .invoice-a4-meta { text-align: right; font-size: 15px; line-height: 1.65; color: #374151; }
  .invoice-a4-meta-label { color: #6b7280; }
  .invoice-a4-status { display: inline-block; margin-top: 6px; padding: 3px 8px; border-radius: 6px; font-size: 14px; font-weight: 700; }
  .invoice-a4-status.paid { background: #e6f4ee; color: #1a7a45; }
  .invoice-a4-status.unpaid { background: #fce8e8; color: #c0392b; }
  .invoice-a4-section { margin-bottom: 16px; }
  .invoice-a4-section h3 { margin: 0 0 8px; font-size: 15px; color: #6B21D8; text-transform: uppercase; letter-spacing: 0.6px; }
  .invoice-a4-customer { background: linear-gradient(135deg, #faf5ff, #f5f3ff); border: 1px solid #e9d5ff; border-radius: 8px; padding: 12px 14px; font-size: 16px; line-height: 1.6; }
  .invoice-a4-specs { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
  .invoice-a4-spec { background: #f9fafb; border-radius: 6px; padding: 8px 10px; font-size: 15px; }
  .invoice-a4-table { width: 100%; border-collapse: collapse; font-size: 15px; }
  .invoice-a4-table th, .invoice-a4-table td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
  .invoice-a4-table th { background: linear-gradient(135deg, #6B21D8, #7C3AED); color: #fff; }
  .invoice-a4-totals { display: flex; justify-content: flex-end; margin-top: 12px; }
  .invoice-a4-totals-box { min-width: 260px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; font-size: 16px; }
  .invoice-a4-totals-box > div { display: flex; justify-content: space-between; padding: 4px 0; }
  .invoice-a4-grand { font-size: 22px; font-weight: 800; color: #6B21D8; border-top: 2px solid #6B21D8; margin-top: 8px; padding-top: 8px; }
  .invoice-a4-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 15px; color: #6B21D8; }

  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    body.printing-invoice * { visibility: hidden !important; }
    body.printing-invoice #invoice-print-area,
    body.printing-invoice #invoice-print-area *,
    body.printing-invoice #invoice-conversion-print-area,
    body.printing-invoice #invoice-conversion-print-area * { visibility: visible !important; }
    body.printing-invoice #invoice-print-area,
    body.printing-invoice #invoice-conversion-print-area {
      position: absolute;
      left: 0;
      top: 0;
      width: 210mm;
      min-height: auto;
      margin: 0;
      padding: 0;
      border: none;
      box-shadow: none;
    }
    body.printing-invoice .no-print { display: none !important; }
  }
  .comparison-row { display: flex; justify-content: space-between; align-items: center; font-size: 15px; padding: 4px 0; }
  .comparison-source { color: #6b7280; }
  .comparison-price { font-weight: 600; }
  .comparison-price.cheaper { color: #059669; }
  .comparison-price.expensive { color: #dc2626; }
  .comparison-price.same { color: #d97706; }
  .item-row { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; }
  .scrollable { max-height: 320px; overflow-y: auto; }
  .empty-state { text-align: center; padding: 40px; color: #6b7280; }
  .upload-zone { border: 2px dashed #d1d5db; border-radius: 10px; padding: 10px 14px; text-align: center; cursor: pointer; background: #f9fafb; margin-bottom: 12px; }
  .upload-zone:hover { border-color: #0ea5e9; background: #f0f9ff; }
  /* Inventory page layout + tables that fit the viewport */
  .inv-page { width: 100%; max-width: 100%; min-width: 0; }
  .inv-category-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; width: 100%; }
  .inv-category-tabs .btn { min-height: 36px; }
  .inv-brand-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; background: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb; width: 100%; box-sizing: border-box; }
  .inv-brand-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; line-height: 1.3; border: 1px solid #d1d5db; background: #fff; color: #374151; min-height: 34px; box-sizing: border-box; }
  .inv-brand-chip.active { border: 2px solid #2563eb; background: #eff6ff; color: #1d4ed8; font-weight: 700; }
  .inv-brand-chip .count { margin-left: 6px; font-size: 12px; font-weight: 600; color: inherit; opacity: 0.85; }
  .gis-card { width: 100%; margin-bottom: 16px; }
  .gis-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .gis-badge { font-size: 13px; color: #2563eb; background: #eff6ff; padding: 4px 12px; border-radius: 999px; white-space: nowrap; }
  .gis-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px 14px; align-items: end; width: 100%; }
  .gis-field label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 6px; font-weight: 600; }
  .gis-actions { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  @media (max-width: 1280px) { .gis-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 900px) {
    .gis-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .main, .main-embedded { padding: 20px 16px 32px; }
  }
  @media (max-width: 640px) {
    .gis-grid { grid-template-columns: 1fr; }
    .page-title { font-size: 22px; }
  }
  .inv-table-card { padding: 12px 14px; overflow: hidden; }
  .inv-table-card .table-wrap { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .inv-table-card table.inv-fit { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12.5px !important; }
  .inv-table-card table.inv-fit th {
    font-size: 10.5px !important;
    padding: 8px 5px !important;
    vertical-align: middle;
    text-align: center;
    white-space: normal;
    line-height: 1.25;
    letter-spacing: 0.03em;
    word-break: break-word;
    hyphens: auto;
  }
  .inv-table-card table.inv-fit td {
    font-size: 12.5px !important;
    padding: 8px 5px !important;
    vertical-align: middle;
    text-align: center;
    word-break: break-word;
  }
  .inv-table-card table.inv-fit th.th-left,
  .inv-table-card table.inv-fit td.td-left { text-align: left; }
  .inv-table-card table.inv-fit th.nr-span { text-align: center; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
  .inv-table-card table.inv-fit th.nr-sub { background: #f8fafc; font-size: 10px !important; }
  .inv-table-card table.inv-fit .badge { font-size: 11px !important; padding: 2px 6px; }
  .inv-table-card table.inv-fit .profit-alert { font-size: 11px !important; padding: 3px 6px !important; white-space: nowrap; }
  .inv-table-card table.inv-fit .btn-sm { min-height: 28px; padding: 0 8px; font-size: 12px; }
  .inv-table-card table.inv-fit .actions-cell { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
  .inv-table-card table.inv-wide { width: 100%; min-width: 1100px; border-collapse: collapse; font-size: 12.5px !important; }
  .inv-table-card table.inv-wide th { font-size: 11px !important; padding: 8px 8px !important; }
  .inv-table-card table.inv-wide td { font-size: 12.5px !important; padding: 8px 8px !important; }
  .inv-table-card table { font-size: 13px; }
  .inv-table-card th { font-size: 11px; padding: 8px 8px; }
  .inv-table-card td { font-size: 13px; padding: 8px 8px; }
  .inv-table-card .badge { font-size: 12px; }
  @media (max-width: 1100px) {
    .app .sidebar { width: 210px; }
    .app .main:not(.main-embedded) { margin-left: 210px; width: calc(100% - 210px); }
  }
  @media (max-width: 900px) {
    .app { flex-direction: column; overflow-x: hidden; }
    .app .sidebar { position: sticky; top: 0; width: 100%; height: auto; max-height: none; border-right: none; border-bottom: 1px solid #e5e7eb; }
    .app .main:not(.main-embedded) { margin-left: 0; width: 100%; }
  }
  .api-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; padding: 4px 10px; border-radius: 20px; font-weight: 600; margin-bottom: 10px; }
  .api-badge.online { background: #d1fae5; color: #059669; }
  .api-badge.offline { background: #fef3c7; color: #d97706; }
  .option-card { border: 2px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 10px; background: #fff; }
  .option-card.recommended { border-color: #0ea5e9; background: #f0f9ff; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
  .bf-frames-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .bf-frame { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; background: #fafafa; }
  .bf-frame-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; margin-bottom: 8px; }
  .bf-frame-label span { font-weight: 500; color: #9ca3af; text-transform: none; letter-spacing: 0; }
  .bf-frame-preview { height: 120px; border-radius: 8px; overflow: hidden; background: #fff; border: 1px dashed #d1d5db; display: flex; align-items: center; justify-content: center; }
  .bf-frame-preview img { width: 100%; height: 100%; object-fit: contain; cursor: pointer; }
  .bf-frame-empty { font-size: 12px; color: #9ca3af; }
  .bf-frame-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .ocr-review { display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
  @media (max-width: 960px) { .ocr-review { grid-template-columns: 1fr; } }
  .ocr-conf { font-size: 11px; font-weight: 700; }
  .ocr-conf.ok { color: #047857; }
  .ocr-conf.low { color: #b45309; }
  .ocr-low .form-input { border-color: #f59e0b; background: #fffbeb; }
  .ocr-row-review td { background: #fffbeb; }
  .ocr-preview { position: sticky; top: 12px; }
`;
