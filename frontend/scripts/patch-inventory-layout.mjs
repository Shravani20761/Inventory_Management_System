import fs from "fs";

const p = "src/appStyles.js";
let s = fs.readFileSync(p, "utf8");

const pairs = [
  [
    ".app { display: flex; min-height: 100vh; }",
    ".app { display: flex; min-height: 100vh; width: 100%; max-width: 100vw; overflow-x: hidden; }",
  ],
  [
    ".sidebar { width: 240px; background: #ffffff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 100; }",
    ".sidebar { width: 230px; flex-shrink: 0; background: #ffffff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; position: fixed; left: 0; top: 0; height: 100vh; z-index: 100; overflow-y: auto; }",
  ],
  [
    ".main { margin-left: 240px; flex: 1; padding: 28px 32px; min-height: 100vh; }",
    `.main { margin-left: 230px; flex: 1; min-width: 0; width: calc(100% - 230px); padding: 28px 32px 40px; min-height: 100vh; box-sizing: border-box; }
  .main-embedded { margin-left: 0 !important; width: 100% !important; max-width: 100%; min-height: 100%; padding: 28px 32px 40px; box-sizing: border-box; }`,
  ],
  [
    ".page-header { margin-bottom: 28px; display: flex; align-items: center; justify-content: space-between; }",
    ".page-header { margin-bottom: 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }\n  .page-header > div:last-child { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }",
  ],
  [
    ".page-title { font-family: 'Space Grotesk', sans-serif; font-size: 30px; font-weight: 700; color: #111827; }",
    ".page-title { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 700; color: #111827; line-height: 1.2; }",
  ],
  [
    ".page-sub { font-size: 16px; color: #6b7280; margin-top: 4px; }",
    ".page-sub { font-size: 14px; color: #6b7280; margin-top: 4px; line-height: 1.4; }",
  ],
  [
    ".btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }",
    ".btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 16px; min-height: 40px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap; box-sizing: border-box; }",
  ],
  [
    ".btn-sm { padding: 5px 10px; font-size: 15px; }",
    ".btn-sm { padding: 0 10px; min-height: 32px; font-size: 13px; }",
  ],
  [
    ".card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }",
    ".card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); box-sizing: border-box; width: 100%; max-width: 100%; }",
  ],
  [
    ".form-input { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 12px; color: #111827; font-size: 17px; outline: none; transition: border 0.15s; }",
    ".form-input { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 12px; min-height: 40px; height: 40px; color: #111827; font-size: 14px; outline: none; transition: border 0.15s; box-sizing: border-box; }",
  ],
  [
    ".form-select { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 12px; color: #111827; font-size: 17px; outline: none; }",
    ".form-select { width: 100%; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 12px; min-height: 40px; height: 40px; color: #111827; font-size: 14px; outline: none; box-sizing: border-box; }",
  ],
  [
    ".form-label { font-size: 15px; color: #4b5563; margin-bottom: 6px; display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }",
    ".form-label { font-size: 12px; color: #4b5563; margin-bottom: 6px; display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }",
  ],
  [
    ".search-bar { display: flex; align-items: center; gap: 10px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 12px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); }",
    ".search-bar { display: flex; align-items: center; gap: 10px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 14px; min-height: 42px; width: 100%; box-sizing: border-box; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); }",
  ],
  [
    ".search-bar input { background: none; border: none; outline: none; color: #111827; font-size: 17px; padding: 9px 0; flex: 1; }",
    ".search-bar input { background: none; border: none; outline: none; color: #111827; font-size: 14px; padding: 10px 0; flex: 1; min-width: 0; width: 100%; }",
  ],
  [
    ".filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }",
    ".filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; width: 100%; }",
  ],
  [
    ".tabs { display: flex; gap: 4px; background: #f3f4f6; border-radius: 10px; padding: 4px; margin-bottom: 20px; }",
    ".tabs { display: flex; flex-wrap: wrap; gap: 6px; background: #f3f4f6; border-radius: 10px; padding: 4px; margin-bottom: 16px; width: 100%; box-sizing: border-box; }",
  ],
  [
    ".tab { padding: 8px 16px; border-radius: 7px; font-size: 16px; font-weight: 500; cursor: pointer; color: #4b5563; transition: all 0.15s; }",
    ".tab { padding: 8px 14px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; color: #4b5563; transition: all 0.15s; min-height: 36px; display: inline-flex; align-items: center; }",
  ],
  [
    ".nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 17px; color: #4b5563; transition: all 0.15s; margin-bottom: 2px; }",
    ".nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #4b5563; transition: all 0.15s; margin-bottom: 2px; }",
  ],
  [
    ".nav-item i { font-size: 22px; }",
    ".nav-item i { font-size: 18px; flex-shrink: 0; }",
  ],
  [
    ".logo-text { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 700; color: #111827; }",
    ".logo-text { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; color: #111827; }",
  ],
  [
    ".logo-sub { font-size: 14px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }",
    ".logo-sub { font-size: 11px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }",
  ],
  [
    ".section-title { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 16px; }",
    ".section-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px; }",
  ],
  [
    ".profit-alert { padding: 10px 14px; border-radius: 8px; font-size: 15px; font-weight: 500; margin-top: 6px; }",
    ".profit-alert { padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 500; margin-top: 0; line-height: 1.3; }",
  ],
  [
    ".badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 14px; font-weight: 600; }",
    ".badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; line-height: 1.3; }",
  ],
  [
    `  /* Bigger, more readable inventory table (overrides per-cell inline font sizes). */
  .inv-table-card table { font-size: 22px; }
  .inv-table-card th { font-size: 17px !important; padding: 14px 12px; }
  .inv-table-card td { font-size: 22px !important; padding: 16px 12px; }
  .inv-table-card .badge { font-size: 17px; }`,
    `  /* Inventory page layout + tables that fit the viewport */
  .inv-page { width: 100%; max-width: 100%; min-width: 0; }
  .inv-category-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .inv-category-tabs .btn { min-height: 36px; }
  .inv-brand-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; background: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb; }
  .inv-brand-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; line-height: 1.3; border: 1px solid #d1d5db; background: #fff; color: #374151; }
  .inv-brand-chip.active { border: 2px solid #2563eb; background: #eff6ff; color: #1d4ed8; font-weight: 700; }
  .inv-brand-chip .count { margin-left: 6px; font-size: 12px; font-weight: 600; color: inherit; opacity: 0.85; }
  .gis-card { width: 100%; }
  .gis-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .gis-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px 14px; align-items: end; width: 100%; }
  .gis-field label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 6px; font-weight: 600; }
  .gis-actions { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  @media (max-width: 1280px) { .gis-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 900px) { .gis-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .main, .main-embedded { padding: 20px 16px 32px; } }
  @media (max-width: 640px) { .gis-grid { grid-template-columns: 1fr; } .page-title { font-size: 22px; } }
  .inv-table-card { padding: 12px 14px; overflow: hidden; }
  .inv-table-card .table-wrap { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .inv-table-card table.inv-fit { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12.5px !important; }
  .inv-table-card table.inv-fit th { font-size: 10.5px !important; padding: 8px 5px !important; vertical-align: middle; text-align: center; white-space: normal; line-height: 1.25; letter-spacing: 0.03em; word-break: break-word; }
  .inv-table-card table.inv-fit td { font-size: 12.5px !important; padding: 8px 5px !important; vertical-align: middle; text-align: center; word-break: break-word; }
  .inv-table-card table.inv-fit th.th-left, .inv-table-card table.inv-fit td.td-left { text-align: left; }
  .inv-table-card table.inv-fit th.nr-span { text-align: center; background: #f8fafc; }
  .inv-table-card table.inv-fit .badge { font-size: 11px !important; padding: 2px 6px; }
  .inv-table-card table.inv-fit .profit-alert { font-size: 11px !important; padding: 3px 6px !important; white-space: nowrap; }
  .inv-table-card table.inv-fit .btn-sm { min-height: 28px; padding: 0 8px; font-size: 12px; }
  .inv-table-card table.inv-wide { width: 100%; min-width: 1100px; border-collapse: collapse; font-size: 12.5px !important; }
  .inv-table-card table.inv-wide th { font-size: 11px !important; padding: 8px 8px !important; }
  .inv-table-card table.inv-wide td { font-size: 12.5px !important; padding: 8px 8px !important; }
  .inv-table-card table { font-size: 13px; }
  .inv-table-card th { font-size: 11px; padding: 8px 8px; }
  .inv-table-card td { font-size: 13px; padding: 8px 8px; }
  .inv-table-card .badge { font-size: 12px; }
  @media (max-width: 1100px) { .app .sidebar { width: 210px; } .app .main { margin-left: 210px; width: calc(100% - 210px); } }
  @media (max-width: 900px) { .app { flex-direction: column; } .app .sidebar { position: sticky; width: 100%; height: auto; border-right: none; border-bottom: 1px solid #e5e7eb; } .app .main { margin-left: 0; width: 100%; } }`,
  ],
];

let ok = 0;
for (const [a, b] of pairs) {
  if (s.includes(a)) {
    s = s.replace(a, b);
    ok++;
  } else {
    console.log("MISS:", a.slice(0, 70));
  }
}
fs.writeFileSync(p, s);
console.log({ ok, total: pairs.length, mainEmbedded: s.includes("main-embedded"), invFit: s.includes("inv-fit") });
