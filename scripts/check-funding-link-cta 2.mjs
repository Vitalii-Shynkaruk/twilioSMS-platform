// © BuyReadySite.com — Read-only проверка production CTA Send Funding Link
import { chromium } from "playwright";

const BASE_URL = process.env.SCL_BASE_URL || "https://app.sclcapital.io";
const EMAIL = process.env.SCL_TEST_EMAIL;
const PASSWORD = process.env.SCL_TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error("Set SCL_TEST_EMAIL and SCL_TEST_PASSWORD before running this check.");
}

const maskEmail = (value = "") => {
  const [name, domain] = String(value).split("@");
  if (!domain) return value ? "[present]" : "[empty]";
  return `${name.slice(0, 2)}***@${domain}`;
};

const sanitizeUrl = (value, email) => {
  if (!value) return null;
  const encodedEmail = encodeURIComponent(email || "");
  return String(value)
    .replaceAll(email || "__missing_email__", "[lead-email]")
    .replaceAll(encodedEmail || "__missing_encoded_email__", "[lead-email]");
};

const parseSuggestions = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

async function fetchInboxPage(page, pageNumber) {
  return page.evaluate(
    async ({ pageNumber }) => {
      const token = localStorage.getItem("scl_token");
      const response = await fetch(
        `/api/inbox?page=${pageNumber}&limit=100&withFilterCounts=true&filter=all&sort=ai_priority`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const body = await response.json().catch(() => ({}));

      return { status: response.status, body };
    },
    { pageNumber },
  );
}

async function searchAndOpen(page, candidate) {
  await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".inbox-search-input", { timeout: 15000 });

  const query =
    candidate.lead?.phone ||
    [candidate.lead?.firstName, candidate.lead?.lastName].filter(Boolean).join(" ") ||
    candidate.id;

  await page.fill(".inbox-search-input", query);
  await page.waitForTimeout(1800);

  const count = await page.locator(".inbox-conv-item").count();
  if (count === 0) {
    return { opened: false, reason: "search returned no conversations" };
  }

  await page.locator(".inbox-conv-item").first().click();
  await page.waitForSelector(".inbox-thread-header", { timeout: 15000 });
  await page.waitForTimeout(1600);

  return { opened: true, query };
}

async function inspectCta(page) {
  const button = page.locator(".suggest-cta-btn").first();
  const legacyCta = page.locator(".sug-cta").first();
  const buttonCount = await page.locator(".suggest-cta-btn").count();
  const legacyCount = await page.locator(".sug-cta").count();

  if (buttonCount > 0) {
    return {
      mode: "button",
      text: (await button.innerText()).trim(),
      disabled: await button.isDisabled(),
      title: await button.getAttribute("title"),
    };
  }

  if (legacyCount > 0) {
    return {
      mode: "legacy-static",
      text: (await legacyCta.innerText()).trim(),
      disabled: null,
      title: null,
    };
  }

  return { mode: "missing", text: "", disabled: null, title: null };
}

async function collectCandidates(page) {
  const candidates = [];
  let totalPages = 1;

  for (let pageNumber = 1; pageNumber <= Math.min(totalPages, 8); pageNumber += 1) {
    const result = await fetchInboxPage(page, pageNumber);
    if (result.status !== 200) {
      console.log("API_PAGE_ERROR", JSON.stringify({ pageNumber, status: result.status }));
      continue;
    }

    totalPages = result.body?.pagination?.pages || totalPages;

    for (const conversation of result.body?.conversations || []) {
      const suggestions = parseSuggestions(conversation.aiSuggestions);
      const suggestionWithCta = suggestions.find((item) => typeof item?.cta === "string" && item.cta.trim());

      if (suggestionWithCta) {
        candidates.push({
          id: conversation.id,
          lead: conversation.lead,
          hasEmail: !!conversation.lead?.email?.trim(),
          email: conversation.lead?.email || "",
          cta: suggestionWithCta.cta || "",
        });
      }
    }

    if (candidates.some((item) => item.hasEmail) && candidates.some((item) => !item.hasEmail)) {
      break;
    }
  }

  return candidates;
}

async function getDeployedMarkers(page) {
  return page.evaluate(async () => {
    const html = await fetch("/").then((response) => response.text());
    const scripts = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
      (match) => match[1],
    );
    const loadedAssets = performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name).pathname)
      .filter((pathname) => pathname.startsWith("/assets/") && /\.(?:js|css)$/.test(pathname));
    const assets = Array.from(new Set([...scripts, ...loadedAssets]));
    const hits = [];

    for (const src of assets) {
      const text = await fetch(src)
        .then((response) => response.text())
        .catch(() => "");
      hits.push({
        src,
        hasSuggestCtaButton: text.includes("suggest-cta-btn"),
        hasGmailCmUrl: text.includes("mail.google.com/mail/?view=cm&fs=1&to="),
      });
    }

    return hits;
  });
}

async function runCase(page, context, label, candidate) {
  if (!candidate) {
    return { skipped: true, reason: `No ${label} candidate found in checked pages.` };
  }

  const opened = await searchAndOpen(page, candidate);
  const cta = opened.opened
    ? await inspectCta(page)
    : { mode: "not-opened", text: opened.reason, disabled: null, title: null };
  let popupUrl = null;

  if (opened.opened && cta.mode === "button" && cta.disabled === false) {
    const popupPromise = context.waitForEvent("page", { timeout: 7000 }).catch(() => null);
    await page.locator(".suggest-cta-btn").first().click();
    const popup = await popupPromise;

    if (popup) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 7000 }).catch(() => {});
      popupUrl = popup.url();
      await popup.close().catch(() => {});
    }
  }

  return {
    opened: opened.opened,
    hasEmail: candidate.hasEmail,
    email: maskEmail(candidate.email),
    expectedDisabled: !candidate.hasEmail,
    cta,
    popupUrl: sanitizeUrl(popupUrl, candidate.email),
    popupHasExpectedTo: popupUrl
      ? popupUrl.includes(`to=${encodeURIComponent(candidate.email)}`) || popupUrl.includes(`to%3D${encodeURIComponent(candidate.email)}`)
      : false,
    popupHasNoSubjectBody: popupUrl
      ? !popupUrl.includes("su=") &&
        !popupUrl.includes("su%3D") &&
        !popupUrl.includes("body=") &&
        !popupUrl.includes("body%3D")
      : false,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(`console.error: ${message.text().slice(0, 180)}`);
  }
});

try {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((currentUrl) => !currentUrl.href.includes("/login"), { timeout: 20000 });

  const candidates = await collectCandidates(page);
  const withoutEmail = candidates.find((item) => !item.hasEmail);
  const withEmail = candidates.find((item) => item.hasEmail);
  const noEmailCase = await runCase(page, context, "without-email", withoutEmail);
  const withEmailCase = await runCase(page, context, "with-email", withEmail);
  const deployedMarkers = await getDeployedMarkers(page);

  const result = {
    loginOk: true,
    ctaCandidates: {
      total: candidates.length,
      withEmail: candidates.filter((item) => item.hasEmail).length,
      withoutEmail: candidates.filter((item) => !item.hasEmail).length,
    },
    noEmailCase,
    withEmailCase,
    deployedMarkers,
    browserErrors: errors.slice(0, 8),
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}