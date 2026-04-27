// © BuyReadySite.com — Скриншот Inbox после Pixel-pass #3
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "https://app.sclcapital.io";
const OUT = path.join(process.cwd(), "audit-screenshots");
const CREDS = { email: "admin@securecreditlines.com", password: "SclAdmin2026!Secure" };

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', CREDS.email);
  await page.fill('input[type="password"]', CREDS.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Открыть первый разговор
  const firstConv = await page.$(".inbox-conv-item");
  if (firstConv) {
    await firstConv.click();
    await page.waitForTimeout(1500);
  }

  const file = path.join(OUT, "diff-prod-after3.png");
  await page.screenshot({ path: file, fullPage: false });
  console.log("Saved:", file);

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
