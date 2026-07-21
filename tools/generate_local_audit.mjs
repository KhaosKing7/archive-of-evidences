import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, ".local");
const outputPath = path.join(outputDir, "audit.html");
const audit = spawnSync(process.execPath, [path.join(root, "tools", "audit_evidence.mjs"), "--json"], {
  cwd: root,
  encoding: "utf8",
});

if (audit.status !== 0) {
  process.stderr.write(audit.stderr || audit.stdout || "The evidence audit failed.\n");
  process.exit(audit.status || 1);
}

const report = JSON.parse(audit.stdout);
const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const preview = entry => `
  <article class="finding">
    <div class="meta">${escapeHtml(entry.section || "")}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ""}</div>
    <p>${escapeHtml(entry.preview || JSON.stringify(entry))}</p>
  </article>`;

const renderList = (title, items, renderer = preview) => `
  <details class="group" ${items.length ? "" : "open"}>
    <summary><span>${escapeHtml(title)}</span><strong>${items.length}</strong></summary>
    <div class="group-body">${items.length ? items.map(renderer).join("") : '<p class="empty">No findings.</p>'}</div>
  </details>`;

const duplicateGroup = group => `<article class="finding duplicate">${group.map(preview).join("")}</article>`;
const duplicatePair = pair => `<article class="finding duplicate">
  <div class="score">Similarity: ${escapeHtml(pair.score ?? pair.ratio)}</div>
  ${preview(pair.left || pair.shorter)}
  ${preview(pair.right || pair.longer)}
</article>`;

const summaryCards = Object.entries(report.summary).map(([label, value]) => `
  <div class="stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label.replace(/([A-Z])/g, " $1"))}</span></div>`).join("");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Archive of Evidences · Local Audit</title>
  <style>
    :root { color-scheme: dark; --gold:#e5b94f; --line:#45391f; --panel:#171611; --muted:#aaa28f; }
    * { box-sizing:border-box; }
    body { margin:0; background:#0d0d0b; color:#f4eddd; font:16px/1.55 Georgia,serif; }
    main { width:min(1120px,calc(100% - 32px)); margin:36px auto 80px; }
    h1 { color:var(--gold); margin-bottom:6px; }
    .notice { color:var(--muted); margin-top:0; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:24px 0; }
    .stat,.group { border:1px solid var(--line); background:var(--panel); border-radius:12px; }
    .stat { padding:14px; display:grid; gap:4px; }
    .stat strong { color:var(--gold); font-size:1.55rem; }
    .stat span { color:var(--muted); text-transform:capitalize; font-size:.82rem; }
    .group { margin:12px 0; overflow:hidden; }
    .group summary { cursor:pointer; display:flex; justify-content:space-between; padding:14px 16px; color:var(--gold); font-weight:700; }
    .group summary strong { min-width:2.2rem; text-align:center; border-radius:999px; background:#292419; }
    .group-body { border-top:1px solid var(--line); padding:12px; }
    .finding { border-left:3px solid var(--gold); background:#11110e; padding:10px 13px; margin:8px 0; }
    .finding .finding { margin:10px 0; }
    .meta,.score { color:var(--gold); font-size:.8rem; }
    .finding p { margin:5px 0 0; }
    .empty { color:var(--muted); }
    table { width:100%; border-collapse:collapse; }
    td,th { padding:8px; border-bottom:1px solid var(--line); text-align:left; }
  </style>
</head>
<body>
<main>
  <h1>Archive of Evidences audit</h1>
  <p class="notice">Local report generated ${escapeHtml(new Date().toLocaleString())}. Duplicate checks are limited to entries inside the same section. Findings are never deleted automatically.</p>
  <section class="stats">${summaryCards}</section>
  ${renderList("Exact duplicate groups", report.exactDuplicates, duplicateGroup)}
  ${renderList("Contained excerpts in the same section", report.containedDuplicates, duplicatePair)}
  ${renderList("Near-duplicate pairs in the same section", report.nearDuplicates, duplicatePair)}
  ${renderList("Missing evidence", report.missingEvidence)}
  ${renderList("Telegram-only sources", report.telegramOnly)}
  ${renderList("Arabic without a complete English translation", report.arabicOnly)}
  ${renderList("Suspicious translation lengths", report.suspiciousTranslationRatios, item => `<article class="finding"><div class="meta">${escapeHtml(item.section)}</div><p>${escapeHtml(item.title)} · Arabic ${escapeHtml(item.arabicWords)} words · English ${escapeHtml(item.englishWords)} words · ratio ${escapeHtml(item.ratio)}</p></article>`)}
  ${renderList("Missing assets", report.missingAssets, item => `<article class="finding"><p>${escapeHtml(item)}</p></article>`)}
  ${renderList("Empty headings", report.emptyHeadings, item => `<article class="finding"><div class="meta">${escapeHtml(item.section)}</div><p>${escapeHtml(item.title)}</p></article>`)}
</main>
</body>
</html>`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(`Audit written to ${outputPath}`);

if (!process.argv.includes("--no-open")) {
  if (process.platform === "win32") {
    spawnSync("powershell", ["-NoProfile", "-Command", "Start-Process", "-LiteralPath", outputPath], { stdio: "ignore" });
  } else if (process.platform === "darwin") {
    spawnSync("open", [outputPath], { stdio: "ignore" });
  } else {
    spawnSync("xdg-open", [outputPath], { stdio: "ignore" });
  }
}
