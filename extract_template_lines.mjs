import fs from 'fs';
import path from 'path';
import pdfjsPkg from 'pdfjs-dist/legacy/build/pdf.js';
const { getDocument } = pdfjsPkg;

const pdfPath = path.resolve('public/template.pdf');
const data = new Uint8Array(fs.readFileSync(pdfPath));
const loadingTask = getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
const pdf = await loadingTask.promise;

const lines = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const buckets = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let bucket = buckets.find((b) => Math.abs(b.y - y) <= 2.2);
    if (!bucket) {
      bucket = { y, items: [] };
      buckets.push(bucket);
    }
    bucket.items.push({ x, y, str: item.str.trim() });
    bucket.y = (bucket.y * (bucket.items.length - 1) + y) / bucket.items.length;
  }
  for (const bucket of buckets) {
    bucket.items.sort((a, b) => a.x - b.x);
    const text = bucket.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    lines.push({ page: p, x: bucket.items[0].x, y: bucket.y, text });
  }
}

lines.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

function scoreLine(t) {
  let score = 0;
  if (/critical\s*point/i.test(t)) score += 12;
  if (/\bcritical\b/i.test(t)) score += 6;
  if (/\bpoints?\b/i.test(t)) score += 3;
  if (/\bP\s*[123]\b|\bP[123]\b/.test(t)) score += 10;
  if (/^\s*\d+[\.)]\s+/.test(t)) score += 7;
  if (/\b\d+[\.)]\b/.test(t)) score += 3;
  if (/\b(point|max|min|relative|absolute|increasing|decreasing|concavity|inflection)\b/i.test(t)) score += 2;
  if (/:$/.test(t)) score += 1;
  return score;
}

const scored = lines.map((line, idx) => ({ ...line, idx, score: scoreLine(line.text) }));
const seeds = [...scored].filter(l => l.score > 0).sort((a,b)=>b.score-a.score||a.page-b.page||b.y-a.y).slice(0,60);

const selected = new Map();
for (const s of seeds) {
  selected.set(s.idx, s);
  for (const d of [-2,-1,1,2]) {
    const n = scored[s.idx + d];
    if (!n || n.page !== s.page) continue;
    selected.set(n.idx, n);
  }
}
if (selected.size < 80) {
  for (const l of [...scored].sort((a,b)=>b.score-a.score||a.page-b.page||b.y-a.y)) {
    selected.set(l.idx, l);
    if (selected.size >= 80) break;
  }
}

const out = [...selected.values()].sort((a,b)=>a.page-b.page||b.y-a.y||a.x-b.x).slice(0,80);
for (const r of out) {
  console.log(`[p${r.page} x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} score=${r.score}] ${r.text}`);
}
