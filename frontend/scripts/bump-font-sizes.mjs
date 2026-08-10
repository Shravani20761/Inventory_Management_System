import fs from "fs";
import path from "path";

const map = {
  28: 34,
  24: 30,
  22: 28,
  20: 24,
  18: 22,
  16: 20,
  15: 18,
  14: 17,
  13: 16,
  12: 15,
  11: 14,
  10: 13,
};

function nextSize(n) {
  const key = String(n);
  if (map[key] != null) return map[key];
  const num = Number(n);
  if (num >= 10) return Math.round(num * 1.2);
  return num;
}

function bumpCss(text) {
  return text.replace(/font-size:\s*(\d+)\s*px(\s*!important)?/g, (_m, n, imp) => {
    return `font-size: ${nextSize(n)}px${imp || ""}`;
  });
}

function bumpJsx(text) {
  let t = text.replace(/fontSize:\s*(\d+)\b/g, (_m, n) => `fontSize: ${nextSize(n)}`);
  t = t.replace(/\btext-xs\b/g, "text-__TMP_SM__");
  t = t.replace(/\btext-sm\b/g, "text-base");
  t = t.replace(/text-__TMP_SM__/g, "text-sm");
  return t;
}

const appStylesPath = "src/appStyles.js";
let app = fs.readFileSync(appStylesPath, "utf8");
app = bumpCss(app);
app = app.replace(
  "body { font-family: 'DM Sans', sans-serif; background: #f4f6f8; color: #111827; min-height: 100vh; }",
  "body { font-family: 'DM Sans', sans-serif; background: #f4f6f8; color: #111827; min-height: 100vh; font-size: 17px; line-height: 1.55; }",
);
fs.writeFileSync(appStylesPath, app);

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(jsx|js)$/.test(ent.name) && ent.name !== "appStyles.js") {
      const raw = fs.readFileSync(p, "utf8");
      if (!/fontSize|text-(xs|sm)\b/.test(raw)) continue;
      fs.writeFileSync(p, bumpJsx(raw));
      console.log("bump", p);
    }
  }
}

walk("src");

const check = fs.readFileSync(appStylesPath, "utf8");
const bad = (check.match(/font-size:\s*px/g) || []).length;
const sample = check.match(/font-size:\s*\d+px/g)?.slice(0, 12);
console.log({ bad, sample });
