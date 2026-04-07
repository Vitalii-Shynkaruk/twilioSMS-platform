// © BuyReadySite.com — Ретест исправлений #1A, #4, #13
import { chromium } from "playwright";

const URL = "https://app.sclcapital.io";
const EMAIL = "admin@securecreditlines.com";
const PASS = "SclAdmin2026!Secure";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  // Логин
  await page.goto(`${URL}/login`);
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASS);
  await page.click("button[type=submit]");
  await page.waitForURL("**/command-center", { timeout: 15000 });
  console.log("✅ Login OK");

  // === Тест #1A: Inbox — имена не дублируются ===
  await page.goto(`${URL}/inbox`);
  await page.waitForSelector(".inbox-conv-item", { timeout: 10000 });
  const names = await page.$$eval(".inbox-conv-name", (els) =>
    els.slice(0, 8).map((e) => e.textContent.trim())
  );
  console.log("\n=== INBOX: Проверка дублирования имён ===");
  let dupFound = false;
  for (const n of names) {
    const parts = n.split(" ");
    if (parts.length >= 2) {
      const half = Math.ceil(parts.length / 2);
      const first = parts.slice(0, half).join(" ");
      const second = parts.slice(half).join(" ");
      const dup = first === second ? "DUP" : "OK";
      if (dup === "DUP") dupFound = true;
      console.log(`  [${dup}] ${n}`);
    } else {
      console.log(`  [OK] ${n}`);
    }
  }
  await page.screenshot({ path: "audit-screenshots/retest-inbox.png", fullPage: false });
  console.log(dupFound ? "❌ Дублирование ещё есть" : "✅ #1A Имена исправлены");

  // === Тест #4: Leads — select overflow ===
  await page.goto(`${URL}/leads`);
  await page.waitForTimeout(3000);

  const selects = await page.$$("select.input");
  let overflowOk = true;
  for (const sel of selects) {
    const box = await sel.boundingBox();
    if (box && box.width > 250) {
      console.log(`❌ Select overflow: width=${Math.round(box.width)}`);
      overflowOk = false;
    }
  }
  console.log(overflowOk ? "✅ #4 Select overflow исправлен" : "❌ #4 Select всё ещё overflow");

  // === Тест #13: Tags truncate ===
  const tagEls = await page.$$(".table-td span[title]");
  let truncateOk = true;
  for (const tag of tagEls.slice(0, 10)) {
    const box = await tag.boundingBox();
    if (box && box.width > 130) {
      const text = await tag.textContent();
      console.log(`❌ Tag overflow: width=${Math.round(box.width)}, text="${text}"`);
      truncateOk = false;
    }
  }
  console.log(truncateOk ? "✅ #13 Tags truncate работает" : "❌ #13 Tags всё ещё overflow");

  await page.screenshot({ path: "audit-screenshots/retest-leads.png", fullPage: false });

  await browser.close();
  console.log("\n🎯 Ретест завершён");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
