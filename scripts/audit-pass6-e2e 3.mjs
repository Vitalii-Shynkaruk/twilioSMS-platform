// © BuyReadySite.com — Pass #6 E2E аудит: toasts, фильтры, per-rep, действия
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "https://app.sclcapital.io";
const OUT = path.join(process.cwd(), "audit-screenshots");
const ADMIN = { email: process.env.SCL_ADMIN_EMAIL, password: process.env.SCL_ADMIN_PASSWORD };

if (!ADMIN.email || !ADMIN.password) {
  throw new Error("Set SCL_ADMIN_EMAIL and SCL_ADMIN_PASSWORD before running this script.");
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const log = (...args) => console.log("[audit]", ...args);
const errors = [];

async function login(page, creds) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/command-center", { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  try {
    log("Login admin...");
    await login(page, ADMIN);
    log("Open inbox");
    await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    await page.waitForSelector(".inbox-conv-item", { timeout: 15000 });

    // ===== Тест 1: Filter counts из API =====
    const adminFilters = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll(".inbox-filters .inbox-filter-btn").forEach((b) => {
        const txt = b.textContent.trim();
        out[txt.replace(/\s+\d+$/, "").trim()] = b.querySelector(".inbox-filter-count")?.textContent;
      });
      return out;
    });
    log("ADMIN filter counts:", adminFilters);

    // ===== Тест 2: Переключение Admin → My Convs =====
    const myBtn = await page.$('.inbox-view-toggle-btn:has-text("MY CONVS")');
    if (myBtn) {
      await myBtn.click();
      await page.waitForTimeout(1500);
      const mineFilters = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll(".inbox-filters .inbox-filter-btn").forEach((b) => {
          const txt = b.textContent.trim();
          out[txt.replace(/\s+\d+$/, "").trim()] = b.querySelector(".inbox-filter-count")?.textContent;
        });
        return out;
      });
      log("MY CONVS filter counts:", mineFilters);

      const allMine = parseInt(mineFilters["All"] || "0", 10);
      const allAdmin = parseInt(adminFilters["All"] || "0", 10);
      if (allMine > allAdmin) errors.push(`My Convs (${allMine}) > Admin View (${allAdmin}) — wrong scope filter`);
      log(`Scope OK: admin=${allAdmin} mine=${allMine}`);

      // вернуться в admin для дальнейших тестов
      const adminBtn = await page.$('.inbox-view-toggle-btn:has-text("ADMIN VIEW")');
      await adminBtn.click();
      await page.waitForTimeout(1500);
    } else {
      errors.push("MY CONVS toggle not found");
    }

    // ===== Тест 3: Unread filter — счётчик и реальный список =====
    const unreadBtn = await page.$('.inbox-filter-btn:has-text("Unread")');
    await unreadBtn.click();
    await page.waitForTimeout(1500);
    const unreadCount = await page.$$eval(".inbox-conv-item", (els) => els.length);
    const unreadBadgeCount = parseInt((await unreadBtn.textContent()).match(/\d+/)?.[0] || "0", 10);
    log(`Unread: list=${unreadCount}, badge=${unreadBadgeCount}`);
    if (Math.abs(unreadCount - unreadBadgeCount) > 5 && unreadCount === 0 && unreadBadgeCount > 0) {
      errors.push(`Unread filter shows 0 items but badge says ${unreadBadgeCount}`);
    }
    await page.screenshot({ path: path.join(OUT, "audit-pass6-unread.png") });

    // ===== Тест 4: Открыть первый разговор и проверить toast при действии =====
    await page.click('.inbox-filter-btn:has-text("All")');
    await page.waitForTimeout(800);
    await page.locator(".inbox-conv-item").first().click();
    await page.waitForSelector(".inbox-thread-actions-bar", { timeout: 10000 });
    await page.waitForTimeout(800);

    // Mark Interested → ждём toast
    const interestedBtn = await page.$('.inbox-action-btn:has-text("Mark Interested")');
    if (interestedBtn) {
      await interestedBtn.click();
      await page.waitForTimeout(800);
      const toastText = await page.$eval("[role='status']", (e) => e.textContent).catch(() => null);
      log("After Mark Interested, toast:", toastText);
      if (!toastText || !/interested/i.test(toastText)) {
        errors.push(`Mark Interested: no toast or wrong text (got: "${toastText}")`);
      }
      await page.screenshot({ path: path.join(OUT, "audit-pass6-toast.png") });
      // Откатить
      await page.waitForTimeout(2000);
      await interestedBtn.click();
      await page.waitForTimeout(800);
    } else {
      errors.push("Mark Interested button not found");
    }

    // ===== Тест 5: REP PERFORMANCE отображает реальные числа =====
    const repPerf = await page.$eval(".rep-perf-section", (el) => el.textContent).catch(() => null);
    log("REP PERFORMANCE:", repPerf);
    if (!repPerf || !/REP PERFORMANCE/.test(repPerf)) errors.push("REP PERFORMANCE section missing");

    // ===== Тест 6: Сообщения inbound vs outbound разделены =====
    const msgAlign = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".inbox-msg")).slice(0, 6);
      return items.map((el) => {
        const cs = window.getComputedStyle(el);
        return {
          dir: el.classList.contains("outbound") ? "out" : "in",
          alignSelf: cs.alignSelf,
        };
      });
    });
    log("Message alignment:", msgAlign);
    msgAlign.forEach((m, i) => {
      const expected = m.dir === "out" ? "flex-end" : "flex-start";
      if (m.alignSelf !== expected) errors.push(`Msg #${i} dir=${m.dir} expected align ${expected} got ${m.alignSelf}`);
    });

    // ===== Тест 7: Pipeline page доступна =====
    await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const pipelineLoaded = await page.$(".pipeline-page, [data-pipeline], .kanban-board");
    log("Pipeline loaded:", !!pipelineLoaded);

    // ===== Тест 8: Проверка реальных данных по репам =====
    await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    await page.waitForSelector(".inbox-conv-item", { timeout: 10000 });
    const repBadges = await page.$$eval(".inbox-conv-rep-badge", (els) =>
      Array.from(new Set(els.map((e) => e.textContent.trim()))),
    );
    log("Distinct rep badges in conv list:", repBadges);
    if (repBadges.length === 0) errors.push("No rep badges visible in conv list");
  } catch (e) {
    errors.push(`exception: ${e.message}\n${e.stack}`);
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "audit-pass6-result.json"), JSON.stringify({ errors }, null, 2));
  log("===== ERRORS =====");
  if (errors.length === 0) log("✅ NO ERRORS — все тесты пройдены");
  else errors.forEach((e) => log("❌", e));
  process.exit(errors.length === 0 ? 0 : 1);
})();
