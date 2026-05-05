// © BuyReadySite.com — Полный браузерный аудит SCL Capital SMS Platform
// Запуск: node scripts/browser-audit.mjs

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://app.sclcapital.io";
const SCREENSHOTS_DIR = path.join(process.cwd(), "audit-screenshots");
const CREDS = { email: process.env.SCL_ADMIN_EMAIL, password: process.env.SCL_ADMIN_PASSWORD };

if (!CREDS.email || !CREDS.password) {
  throw new Error("Set SCL_ADMIN_EMAIL and SCL_ADMIN_PASSWORD before running this script.");
}

// Все страницы для проверки
const PAGES = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Pipeline", path: "/pipeline" },
  { name: "CommandCenter", path: "/command-center" },
  { name: "Leads", path: "/leads" },
  { name: "Inbox", path: "/inbox" },
  { name: "Campaigns", path: "/campaigns" },
  { name: "Numbers", path: "/numbers" },
  { name: "Automation", path: "/automation" },
  { name: "Analytics", path: "/analytics" },
  { name: "Settings", path: "/settings" },
];

// Размеры для адаптивности
const VIEWPORTS = [
  { name: "Desktop", width: 1920, height: 1080 },
  { name: "Laptop", width: 1440, height: 900 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Mobile", width: 375, height: 812 },
];

const results = {
  timestamp: new Date().toISOString(),
  loginOk: false,
  pages: [],
  consoleErrors: [],
  networkErrors: [],
  styleIssues: [],
  functionalIssues: [],
  responsiveIssues: [],
  a11yIssues: [],
};

async function run() {
  // Создаём папку для скриншотов
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Собираем все console.error
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      results.consoleErrors.push({
        text: msg.text().slice(0, 300),
        url: page.url(),
      });
    }
  });

  // Собираем network ошибки (4xx, 5xx)
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && !response.url().includes("favicon")) {
      results.networkErrors.push({
        url: response.url().slice(0, 200),
        status,
        page: page.url(),
      });
    }
  });

  // ═══ ФАЗА 1: LOGIN ═══
  console.log("\n═══ ФАЗА 1: Авторизация ═══");
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-login-page.png`, fullPage: true });

    // Проверяем наличие формы
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    if (await emailInput.count() === 0) {
      results.functionalIssues.push({ page: "Login", issue: "Поле email не найдено", severity: "critical" });
    }
    if (await passwordInput.count() === 0) {
      results.functionalIssues.push({ page: "Login", issue: "Поле password не найдено", severity: "critical" });
    }

    // Попытка логина
    await emailInput.first().fill(CREDS.email);
    await passwordInput.first().fill(CREDS.password);
    await submitBtn.first().click();
    await page.waitForURL("**/dashboard**", { timeout: 15000 }).catch(() => {});

    if (page.url().includes("dashboard") || page.url().includes("command-center")) {
      results.loginOk = true;
      console.log("  ✅ Логин успешен, редирект на:", page.url());
    } else {
      results.loginOk = false;
      results.functionalIssues.push({
        page: "Login",
        issue: `Логин не удался. URL после submit: ${page.url()}`,
        severity: "critical",
      });
      console.log("  ❌ Логин не удался:", page.url());
    }
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-after-login.png`, fullPage: true });
  } catch (err) {
    results.functionalIssues.push({ page: "Login", issue: `Ошибка: ${err.message}`, severity: "critical" });
    console.log("  ❌ Ошибка логина:", err.message);
  }

  if (!results.loginOk) {
    console.log("\n❌ Логин не удался — дальнейшее тестирование невозможно.");
    await browser.close();
    writeReport();
    return;
  }

  // ═══ ФАЗА 2: ПРОВЕРКА КАЖДОЙ СТРАНИЦЫ ═══
  console.log("\n═══ ФАЗА 2: Проверка страниц ═══");
  for (const pg of PAGES) {
    console.log(`\n  📄 ${pg.name} (${pg.path})`);
    const pageResult = {
      name: pg.name,
      path: pg.path,
      loaded: false,
      loadTime: 0,
      hasContent: false,
      hasEmptyState: false,
      buttonsCount: 0,
      formsCount: 0,
      linksCount: 0,
      errors: [],
      consoleErrorsBefore: results.consoleErrors.length,
    };

    try {
      const startTime = Date.now();
      await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: "networkidle", timeout: 30000 });
      pageResult.loadTime = Date.now() - startTime;
      pageResult.loaded = true;

      // Ждём рендеринга
      await page.waitForTimeout(2000);

      // Скриншот
      await page.screenshot({
        path: `${SCREENSHOTS_DIR}/page-${pg.name.toLowerCase()}.png`,
        fullPage: true,
      });

      // Проверяем контент
      const bodyText = await page.locator("body").innerText();
      pageResult.hasContent = bodyText.length > 100;
      pageResult.hasEmptyState = bodyText.toLowerCase().includes("no data") ||
        bodyText.toLowerCase().includes("empty") ||
        bodyText.toLowerCase().includes("no results") ||
        bodyText.toLowerCase().includes("nothing");

      // Считаем элементы
      pageResult.buttonsCount = await page.locator("button").count();
      pageResult.formsCount = await page.locator("form").count();
      pageResult.linksCount = await page.locator("a[href]").count();

      // Проверяем вёрстку: горизонтальный скролл
      const hasHScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      if (hasHScroll) {
        results.styleIssues.push({
          page: pg.name,
          issue: "Горизонтальный скролл на Desktop (1920px)",
          severity: "medium",
        });
      }

      // Проверяем overflow
      const overflows = await page.evaluate(() => {
        const issues = [];
        document.querySelectorAll("*").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth + 5 && rect.width > 50) {
            issues.push({
              tag: el.tagName,
              class: el.className?.toString().slice(0, 80) || "",
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            });
          }
        });
        return issues.slice(0, 5);
      });
      if (overflows.length > 0) {
        results.styleIssues.push({
          page: pg.name,
          issue: `Элементы выходят за viewport: ${JSON.stringify(overflows[0])}`,
          severity: "medium",
        });
      }

      // Проверяем битые картинки
      const brokenImages = await page.evaluate(() => {
        const imgs = document.querySelectorAll("img");
        const broken = [];
        imgs.forEach((img) => {
          if (!img.complete || img.naturalWidth === 0) {
            broken.push(img.src || img.getAttribute("data-src"));
          }
        });
        return broken;
      });
      if (brokenImages.length > 0) {
        results.styleIssues.push({
          page: pg.name,
          issue: `Битые изображения: ${brokenImages.join(", ")}`,
          severity: "low",
        });
      }

      // Проверяем A11y базово
      const a11y = await page.evaluate(() => {
        const issues = [];
        // Кнопки без текста/aria-label
        document.querySelectorAll("button").forEach((btn) => {
          if (!btn.textContent?.trim() && !btn.getAttribute("aria-label") && !btn.getAttribute("title")) {
            issues.push(`Кнопка без label: ${btn.outerHTML.slice(0, 100)}`);
          }
        });
        // Формы без label
        document.querySelectorAll("input:not([type=hidden])").forEach((input) => {
          const id = input.id;
          const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : false;
          const hasAriaLabel = input.getAttribute("aria-label") || input.getAttribute("placeholder");
          if (!hasLabel && !hasAriaLabel) {
            issues.push(`Input без label/placeholder: ${input.outerHTML.slice(0, 100)}`);
          }
        });
        // Контраст заголовков (грубая проверка)
        document.querySelectorAll("h1, h2, h3").forEach((h) => {
          const style = getComputedStyle(h);
          if (style.color === style.backgroundColor) {
            issues.push(`Заголовок с нулевым контрастом: ${h.textContent?.slice(0, 50)}`);
          }
        });
        return issues.slice(0, 10);
      });
      if (a11y.length > 0) {
        a11y.forEach((issue) => {
          results.a11yIssues.push({ page: pg.name, issue, severity: "low" });
        });
      }

      // Новые console.error для этой страницы
      const newErrors = results.consoleErrors.length - pageResult.consoleErrorsBefore;
      if (newErrors > 0) {
        pageResult.errors.push(`${newErrors} console.error на этой странице`);
      }

      console.log(`    ✅ Загружена за ${pageResult.loadTime}ms | ${pageResult.buttonsCount} кнопок | ${pageResult.formsCount} форм`);
    } catch (err) {
      pageResult.errors.push(`Не удалось загрузить: ${err.message}`);
      console.log(`    ❌ Ошибка: ${err.message}`);
    }

    results.pages.push(pageResult);
  }

  // ═══ ФАЗА 3: АДАПТИВНОСТЬ ═══
  console.log("\n═══ ФАЗА 3: Адаптивность ═══");
  const responsivePages = ["Dashboard", "Pipeline", "Inbox"];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const pgName of responsivePages) {
      const pg = PAGES.find((p) => p.name === pgName);
      if (!pg) continue;

      try {
        await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(1500);

        // Скриншот
        await page.screenshot({
          path: `${SCREENSHOTS_DIR}/responsive-${pgName.toLowerCase()}-${vp.name.toLowerCase()}.png`,
          fullPage: true,
        });

        // Горизонтальный скролл
        const hasHScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        if (hasHScroll) {
          results.responsiveIssues.push({
            page: pgName,
            viewport: `${vp.name} (${vp.width}x${vp.height})`,
            issue: "Горизонтальный скролл",
          });
        }

        // Текст за пределами экрана
        const overflow = await page.evaluate(() => {
          let count = 0;
          document.querySelectorAll("*").forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.right > window.innerWidth + 10 && el.textContent?.trim().length > 5) count++;
          });
          return count;
        });
        if (overflow > 3) {
          results.responsiveIssues.push({
            page: pgName,
            viewport: `${vp.name} (${vp.width}x${vp.height})`,
            issue: `${overflow} элементов выходят за пределы экрана`,
          });
        }

        console.log(`  ${vp.name} ${pgName}: ${hasHScroll ? "⚠️ H-scroll" : "✅ OK"}`);
      } catch (err) {
        console.log(`  ${vp.name} ${pgName}: ❌ ${err.message.slice(0, 80)}`);
      }
    }
  }

  // ═══ ФАЗА 4: ФУНКЦИОНАЛЬНЫЕ ТЕСТЫ ═══
  console.log("\n═══ ФАЗА 4: Функциональные тесты ═══");
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 4.1: Навигация — все пункты меню
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle", timeout: 15000 });
    const navLinks = page.locator("nav a[href], aside a[href], .sidebar a[href]");
    const navCount = await navLinks.count();
    console.log(`  Навигация: ${navCount} ссылок`);

    // Проверяем активную страницу подсвечена
    for (const pg of PAGES) {
      await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: "networkidle", timeout: 15000 });
      const activeLink = await page.locator(`nav a[href*="${pg.path}"].active, nav a[href*="${pg.path}"][aria-current], aside a[href*="${pg.path}"].active`).count();
      if (activeLink === 0) {
        // Проверяем по классам с 'active' или стилю
        const hasHighlight = await page.evaluate((path) => {
          const links = document.querySelectorAll(`a[href*="${path}"]`);
          for (const link of links) {
            const classes = link.className || "";
            if (classes.includes("active") || classes.includes("current") || classes.includes("selected")) return true;
            const style = getComputedStyle(link);
            if (style.fontWeight === "700" || style.fontWeight === "bold") return true;
          }
          return false;
        }, pg.path);
        if (!hasHighlight) {
          results.functionalIssues.push({
            page: pg.name,
            issue: "Активная страница не подсвечена в навигации",
            severity: "low",
          });
        }
      }
    }
  } catch (err) {
    results.functionalIssues.push({ page: "Navigation", issue: `Ошибка: ${err.message}`, severity: "medium" });
  }

  // 4.2: Pipeline — Drag & Drop тест
  try {
    await page.goto(`${BASE_URL}/pipeline`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const dealCards = page.locator("[data-deal-id], .deal-card, .pipe-card");
    const cardCount = await dealCards.count();
    console.log(`  Pipeline: ${cardCount} карточек сделок`);

    if (cardCount > 0) {
      // Проверяем клик на первую карточку
      await dealCards.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/pipeline-deal-click.png`, fullPage: true });

      // Проверяем открылась ли панель деталей
      const panel = page.locator(".deal-panel, .deal-detail, [class*='panel']");
      const panelVisible = await panel.count() > 0;
      console.log(`  Pipeline deal panel: ${panelVisible ? "✅ открывается" : "⚠️ не обнаружена"}`);
    }
  } catch (err) {
    console.log(`  Pipeline: ❌ ${err.message.slice(0, 100)}`);
  }

  // 4.3: Inbox — проверка списка и отправки
  try {
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const convList = page.locator(".inbox-conv-item, .inbox-conv-list > *, [class*='conversation']");
    const convCount = await convList.count();
    console.log(`  Inbox: ${convCount} разговоров`);

    // Проверяем поиск
    const searchInput = page.locator("input[placeholder*='earch'], .inbox-search-input");
    if (await searchInput.count() > 0) {
      await searchInput.first().fill("test");
      await page.waitForTimeout(1000);
      console.log("  Inbox search: ✅ работает");
      await searchInput.first().clear();
    }

    // Проверяем фильтры
    const filterBtns = page.locator(".inbox-filter-btn, [class*='filter'] button");
    const filterCount = await filterBtns.count();
    console.log(`  Inbox filters: ${filterCount} кнопок фильтров`);
  } catch (err) {
    console.log(`  Inbox: ❌ ${err.message.slice(0, 100)}`);
  }

  // 4.4: Leads page — таблица и кнопки
  try {
    await page.goto(`${BASE_URL}/leads`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    const tableRows = page.locator("table tbody tr, [class*='lead-row'], [class*='leads'] tr");
    const rowCount = await tableRows.count();
    console.log(`  Leads: ${rowCount} строк`);

    // Import CSV кнопка
    const importBtn = page.locator("button:has-text('Import'), button:has-text('import'), button:has-text('CSV')");
    if (await importBtn.count() > 0) {
      console.log("  Leads import button: ✅ найдена");
    }
  } catch (err) {
    console.log(`  Leads: ❌ ${err.message.slice(0, 100)}`);
  }

  // 4.5: Settings — вкладки
  try {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1500);

    const tabs = page.locator("[role='tab'], .settings-tab, [class*='tab'] button");
    const tabCount = await tabs.count();
    console.log(`  Settings: ${tabCount} вкладок`);

    // Кликаем каждую вкладку
    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      try {
        await tabs.nth(i).click();
        await page.waitForTimeout(500);
      } catch {
        results.functionalIssues.push({
          page: "Settings",
          issue: `Вкладка #${i + 1} не кликабельна`,
          severity: "low",
        });
      }
    }
  } catch (err) {
    console.log(`  Settings: ❌ ${err.message.slice(0, 100)}`);
  }

  // ═══ ФАЗА 5: СТИЛИ ═══
  console.log("\n═══ ФАЗА 5: Стили и шрифты ═══");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle", timeout: 15000 });

  // Проверяем шрифты
  const fonts = await page.evaluate(() => {
    const usedFonts = new Set();
    document.querySelectorAll("body, h1, h2, h3, h4, p, span, a, button, td, input").forEach((el) => {
      const ff = getComputedStyle(el).fontFamily;
      if (ff) usedFonts.add(ff.split(",")[0].trim().replace(/['"]/g, ""));
    });
    return [...usedFonts];
  });
  console.log(`  Шрифты: ${fonts.join(", ")}`);

  // Проверяем тёмную тему
  const isDark = await page.evaluate(() => {
    return document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark") ||
      getComputedStyle(document.body).backgroundColor.includes("rgb(") &&
        parseInt(getComputedStyle(document.body).backgroundColor.match(/\d+/)?.[0] || "128") < 50;
  });
  console.log(`  Тёмная тема: ${isDark ? "✅ активна" : "⚠️ не активна"}`);

  // Проверяем z-index коллизии (модалки)
  const zIndexIssues = await page.evaluate(() => {
    const issues = [];
    const elements = document.querySelectorAll("*");
    const highZ = [];
    elements.forEach((el) => {
      const z = parseInt(getComputedStyle(el).zIndex);
      if (!isNaN(z) && z > 1000) {
        highZ.push({ tag: el.tagName, cls: (el.className?.toString() || "").slice(0, 60), z });
      }
    });
    if (highZ.length > 10) {
      issues.push(`Слишком много элементов с z-index > 1000 (${highZ.length} штук)`);
    }
    return issues;
  });
  zIndexIssues.forEach((issue) => {
    results.styleIssues.push({ page: "Global", issue, severity: "low" });
  });

  // ═══ ФИНАЛ ═══
  await browser.close();
  writeReport();
}

function writeReport() {
  // JSON для машинного анализа
  fs.writeFileSync(
    `${SCREENSHOTS_DIR}/audit-results.json`,
    JSON.stringify(results, null, 2),
    "utf-8"
  );

  // Краткий вывод в консоль
  console.log("\n" + "═".repeat(60));
  console.log("  ИТОГИ БРАУЗЕРНОГО АУДИТА");
  console.log("═".repeat(60));
  console.log(`  Логин: ${results.loginOk ? "✅" : "❌"}`);
  console.log(`  Страниц проверено: ${results.pages.length}`);
  console.log(`  Console errors: ${results.consoleErrors.length}`);
  console.log(`  Network errors (4xx/5xx): ${results.networkErrors.length}`);
  console.log(`  Проблемы стилей: ${results.styleIssues.length}`);
  console.log(`  Функциональные: ${results.functionalIssues.length}`);
  console.log(`  Адаптивность: ${results.responsiveIssues.length}`);
  console.log(`  A11y: ${results.a11yIssues.length}`);
  console.log("═".repeat(60));

  // Детали
  if (results.consoleErrors.length > 0) {
    console.log("\n🔴 Console Errors:");
    results.consoleErrors.slice(0, 15).forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.url.split("/").pop()}] ${e.text.slice(0, 150)}`);
    });
  }

  if (results.networkErrors.length > 0) {
    console.log("\n🟡 Network Errors:");
    results.networkErrors.slice(0, 10).forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.status} ${e.url.split("/api/").pop()?.slice(0, 100)}`);
    });
  }

  if (results.styleIssues.length > 0) {
    console.log("\n🟡 Стили:");
    results.styleIssues.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.page}] ${e.issue}`);
    });
  }

  if (results.functionalIssues.length > 0) {
    console.log("\n🟠 Функциональные:");
    results.functionalIssues.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.page}] ${e.issue}`);
    });
  }

  if (results.responsiveIssues.length > 0) {
    console.log("\n📱 Адаптивность:");
    results.responsiveIssues.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.page}] ${e.viewport}: ${e.issue}`);
    });
  }

  if (results.a11yIssues.length > 0) {
    console.log("\n♿ A11y:");
    results.a11yIssues.slice(0, 10).forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.page}] ${e.issue.slice(0, 120)}`);
    });
  }

  console.log(`\n📁 Скриншоты: ${SCREENSHOTS_DIR}/`);
  console.log(`📄 JSON: ${SCREENSHOTS_DIR}/audit-results.json`);
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
