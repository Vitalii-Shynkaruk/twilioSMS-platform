// © BuyReadySite.com — генератор PNG-доказательств для письма клиенту.
// Берёт реальные строки из docs/SCL_AI_INBOX_BUILD_PLAN.md и рендерит
// каждую цитату с подсветкой целевой строки.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname || ".", "..");
const OUT = path.join(ROOT, "client-evidence", "dashboard-removal");
mkdirSync(OUT, { recursive: true });

const SRC = path.join(ROOT, "docs", "SCL_AI_INBOX_BUILD_PLAN.md");
const PROTO = "/tmp/scl-inbox-v5.html";

const lines = readFileSync(SRC, "utf8").split("\n");
const protoLines = readFileSync(PROTO, "utf8").split("\n");

// Целевые источники: { name, file, ranges:[start,end], highlightLine }
const sources = [
  {
    id: "01-sidebar",
    file: "docs/SCL_AI_INBOX_BUILD_PLAN.md",
    title: "Build Plan v1.1 — line 52 (Navigation sidebar)",
    range: [48, 56],
    highlight: 52,
    src: lines,
  },
  {
    id: "02-gap-analysis",
    file: "docs/SCL_AI_INBOX_BUILD_PLAN.md",
    title: "Build Plan v1.1 — line 80 (Gap Analysis #16)",
    range: [76, 84],
    highlight: 80,
    src: lines,
  },
  {
    id: "03-removed",
    file: "docs/SCL_AI_INBOX_BUILD_PLAN.md",
    title: "Build Plan v1.1 — lines 448-449 (Dashboard removed + route deleted)",
    range: [444, 452],
    highlight: [448, 449],
    src: lines,
  },
  {
    id: "04-acceptance",
    file: "docs/SCL_AI_INBOX_BUILD_PLAN.md",
    title: "Build Plan v1.1 — line 495 (Acceptance test N1)",
    range: [490, 498],
    highlight: 495,
    src: lines,
  },
  {
    id: "05-prototype",
    file: "scl-inbox-v5.html (approved prototype)",
    title: "Approved prototype scl-inbox-v5.html — sidebar nav (lines 296-321)",
    range: [294, 323],
    highlight: 296,
    src: protoLines,
  },
];

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: -apple-system, "SF Pro Display", "Segoe UI", sans-serif;
         background: #0d1117; color: #c9d1d9; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; overflow: hidden; max-width: 1280px; }
  .hdr { padding: 16px 24px; background: linear-gradient(90deg, #1f6feb22, #161b22);
         border-bottom: 1px solid #30363d; }
  .hdr .title { font-size: 18px; font-weight: 600; color: #e6edf3; }
  .hdr .sub { font-size: 13px; color: #8b949e; margin-top: 4px; font-family: "SF Mono", Menlo, monospace; }
  pre { margin: 0; padding: 20px 0; background: #0d1117; overflow-x: auto;
        font-family: "SF Mono", "Menlo", "Consolas", monospace;
        font-size: 13.5px; line-height: 1.55; }
  .row { display: flex; padding: 0 24px; }
  .row.hl { background: #ffd33d22; border-left: 3px solid #ffd33d; padding-left: 21px; }
  .ln { width: 48px; color: #6e7681; user-select: none; flex-shrink: 0; text-align: right; padding-right: 16px; }
  .row.hl .ln { color: #ffd33d; font-weight: 600; }
  .ct { white-space: pre; flex: 1; }
  .row.hl .ct { color: #ffd33d; font-weight: 500; }
  .footer { padding: 12px 24px; border-top: 1px solid #30363d; font-size: 12px; color: #8b949e; }
  .badge { display: inline-block; background: #1f6feb33; color: #58a6ff; padding: 2px 8px;
           border-radius: 4px; font-size: 11px; font-weight: 600; margin-right: 8px; }
`;

function buildHtml(s) {
  const [from, to] = s.range;
  const hl = Array.isArray(s.highlight) ? s.highlight : [s.highlight];
  const rows = [];
  for (let i = from; i <= to && i <= s.src.length; i++) {
    const isHl = hl.includes(i);
    const text = escapeHtml(s.src[i - 1] || "");
    rows.push(
      `<div class="row${isHl ? " hl" : ""}"><span class="ln">${i}</span><span class="ct">${text || " "}</span></div>`
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${s.title}</title><style>${css}</style></head>
  <body><div class="card">
    <div class="hdr">
      <div class="title">${s.title}</div>
      <div class="sub"><span class="badge">SOURCE</span>${s.file}</div>
    </div>
    <pre>${rows.join("")}</pre>
    <div class="footer">Highlighted line${hl.length > 1 ? "s" : ""}: ${hl.join(", ")} · client-confirmed source for Dashboard → Command Center merge</div>
  </div></body></html>`;
}

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

for (const s of sources) {
  const htmlPath = path.join(OUT, `${s.id}.html`);
  const pngPath = path.join(OUT, `${s.id}.png`);
  writeFileSync(htmlPath, buildHtml(s));
  console.log(`→ rendering ${s.id}.png ...`);
  execSync(
    `"${CHROME}" --headless=new --no-sandbox --disable-gpu --hide-scrollbars ` +
      `--window-size=1340,900 --screenshot="${pngPath}" "file://${htmlPath}"`,
    { stdio: "ignore" },
  );
  console.log(`  ✅ ${pngPath}`);
}

// Cover/index README so папка сама себя объясняет
const readme = `# Dashboard removal — client-confirmed evidence

Прикладывается к письму клиенту в ответ на «дашборд пропал».

5 источников, все подтверждены клиентом 20.04.2026 в Build Plan v1.1:

| # | Скрин | Цитата |
|---|---|---|
| 1 | 01-sidebar.png | Sidebar table → "Dashboard merges into Command Center" |
| 2 | 02-gap-analysis.png | Gap-analysis row #16 → "Dashboard → Command Center merge / Page merge + route delete" |
| 3 | 03-removed.png | "Removed. SMS metrics merged into Command Center bottom section." + "/dashboard Deleted. Redirect to /command-center" |
| 4 | 04-acceptance.png | Acceptance test N1: "Dashboard removed → Redirect to Command Center. No sidebar item." |
| 5 | 05-prototype.png | Approved prototype scl-inbox-v5.html sidebar nav — Dashboard отсутствует |

Все Dashboard SMS-метрики живут внутри Command Center (SmsBar, client/src/pages/CommandCenterPage.tsx).
\`/dashboard\` URL-ы редиректят на \`/command-center\`.
`;
writeFileSync(path.join(OUT, "README.md"), readme);
console.log("\nDone.", OUT);
