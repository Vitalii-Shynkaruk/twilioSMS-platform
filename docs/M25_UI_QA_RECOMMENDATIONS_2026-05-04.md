© BuyReadySite.com

# M25 UI QA Recommendations — Login/Auth + Campaigns

Дата: 2026-05-04
Статус: code-side визуальная и сценарная проверка завершена; внешний блокер остается только по production email OTP fallback без подтвержденного SMTP.

## Что проверено

- Login/Auth desktop 1158x768 и mobile 390x844: dark HUD frame, SCL wordmark, headline, panel, input, primary CTA, phone note, footer, отсутствие горизонтального overflow.
- Campaigns desktop 1366x768 и mobile 390x844: topbar/tabs shell, AI Retarget Suggestions, cards, buttons, table/list area, prototype tokens.
- Prototype reference: `https://papaya-swan-76d714.netlify.app/scl_leads_campaigns_scope_v3.html`.
- Сценарии: SMS OTP step, email fallback после SMS step, verify redirect, Campaigns search, status filter, AI Preview modal, AI Build modal.

Evidence:

- `audit-screenshots/m25-login-desktop.png`
- `audit-screenshots/m25-login-mobile.png`
- `audit-screenshots/m25-campaigns-desktop.png`
- `audit-screenshots/m25-campaigns-mobile.png`
- `audit-screenshots/m25-prototype-campaigns-desktop.png`
- `audit-screenshots/m25-visual-regression-evidence.json`

## Нелогичные решения / работа функций

1. Email fallback на первом Login экране конфликтовал с клиентским скрином.
   Рекомендация: держать fallback только после SMS code step. Так первый экран остается чистым и совпадает с визуальным контрактом, но пользователь все еще может переключиться на email, если потерял доступ к телефону.

2. Login wordmark сейчас CSS-rendered, а не оригинальный брендовый asset.
   Рекомендация: запросить у клиента оригинальный SCL logo/wordmark в SVG или PNG 2x/3x. Без исходного asset можно быть очень близко, но не гарантировать абсолютный pixel-perfect по бликам, наклону и металлической фактуре.

3. Campaigns ранее отображался внутри старого sidebar shell, хотя прототип использует topbar + tabs.
   Рекомендация: оставить route-scoped Campaigns shell для M2 acceptance, но после демо решить системно: либо Campaigns/Leads становятся отдельным M2 shell, либо весь app shell приводится к единой новой дизайн-системе.

4. Campaigns CTA `New Campaign` и AI CTA `Build Campaign` визуально похожи, но ведут к разным workflow.
   Рекомендация: в следующем UX проходе добавить более явные заголовки в modal: `New Manual Campaign` и `Build AI Campaign`, а также short helper copy внутри modal, не на основном экране.

5. AI Retarget карточки показывают предупреждения, но не объясняют источник ограничения.
   Рекомендация: добавить tooltip/expand details для `admin-override`, `capacity trim`, `retargeted in last 7d`, чтобы менеджер понимал, почему часть лидов не попала в кампанию.

6. Email OTP fallback технически доступен в UI после SMS step, но production требует рабочий SMTP relay или внешние SMTP credentials.
   Рекомендация: до настройки SMTP либо оставить текущее поведение с понятной ошибкой, либо временно скрывать email fallback при health/config check. Лучшее решение — подтвердить серверный SMTP relay или подключить внешний SMTP и закрыть блокер.

7. AI функции зависят от Anthropic/OpenAI ключей в `SystemSetting`, но пользователю не всегда видно, какой провайдер реально активен.
   Рекомендация: добавить admin-only Integration Health card: provider, model, last successful AI call, last error, masked key presence.

8. Campaigns mock/demo totals могут отличаться от production totals.
   Рекомендация: в acceptance показывать production evidence отдельно от mocked visual evidence, чтобы клиент не сравнивал тестовые `3 campaigns` с реальными `17 campaigns` как баг данных.

## API keys и где их получить

### SMTP — обязательно для email OTP fallback

Нужно получить:

- sender email, например `login@sclcapital.io` или другой authorized sender на домене клиента;
- подтверждение, что production server SMTP relay может отправлять письма с этого домена;
- если используется внешний SMTP: host, port, username, password, secure TLS mode.

Шаги:

1. Для серверного SMTP подтвердить, что на production доступен SMTP relay `127.0.0.1:25`.
2. В DNS домена проверить SPF/DKIM/DMARC для выбранного отправителя.
3. В Settings → Integrations → Email Sign-in сохранить `From Email`, `SMTP Host`, `SMTP Port` и `Secure TLS`.
4. Для внешнего SMTP дополнительно сохранить username/password, полученные у провайдера.
5. Проверить `POST /api/auth/request-otp` с `channel=email`: письмо должно прийти в течение 30 секунд.

### Anthropic — основной AI provider для AI Inbox / AI Retarget reasoning

Нужно получить:

- `anthropicApiKey`
- `anthropicModel`, по умолчанию используется `claude-sonnet-4-5`.

Шаги:

1. Перейти на `https://console.anthropic.com`.
2. Создать organization/project клиента и включить billing.
3. В разделе API Keys создать production key.
4. В админке платформы открыть Settings → Integrations и указать provider `anthropic`, API key и модель.
5. Проверить AI suggestion / cohort reasoning на тестовом inbound или тестовом cohort preview.
6. Хранить ключ только в защищенном хранилище или в SystemSetting/secret manager, не в репозитории.

### OpenAI — опциональный fallback, если клиент хочет использовать OpenAI вместо Anthropic

Нужно получить:

- `openaiApiKey`
- `openaiModel`, текущий fallback model: `gpt-4.1-mini`.

Шаги:

1. Перейти на `https://platform.openai.com/api-keys`.
2. Создать project key и включить billing/usage limits.
3. В Settings → Integrations выбрать provider `openai` и указать key/model.
4. Проверить AI draft/classification flow.

### Twilio — SMS sending, inbound webhooks, A2P/10DLC

Нужно получить/подтвердить:

- Twilio Account SID.
- Twilio Auth Token.
- Messaging Service SID.
- A2P/10DLC Brand + Campaign approval.
- Webhook URLs на production domain.

Шаги:

1. Перейти на `https://console.twilio.com`.
2. Account SID/Auth Token находятся в Console → Account Info.
3. Messaging Service SID находится в Messaging → Services → нужный сервис.
4. В Messaging Service проверить sender pool и A2P/10DLC привязку.
5. Настроить webhook URLs:
   - inbound: `https://app.sclcapital.io/api/webhooks/twilio/inbound`
   - status callback: `https://app.sclcapital.io/api/webhooks/twilio/status`
6. В платформе Settings → Integrations или в production env указать Twilio credentials/Messaging Service SID.
7. В Numbers нажать Sync Twilio и проверить, что номера подтянулись и имеют правильный статус.

### SCL logo/wordmark asset — обязательно для абсолютного pixel-perfect Login

Нужно запросить у клиента:

- Original SCL logo/wordmark SVG preferred.
- PNG fallback: transparent background, минимум 2x/3x desktop size.
- Если есть брендбук: цвета, spacing, typography, glow/shadow rules.

## 📩 Сообщение / Письмо:

Hi team,

We completed the latest UI QA pass for the SCL Login/Auth page and the Campaigns page.

The Login screen was updated to match the dark SCL visual reference much more closely: centered SCL wordmark, HUD frame, headline, sign-in panel, blue Send Code CTA, phone verification note, and footer. The email fallback link is now shown only after the SMS code step, so the first login screen stays aligned with the screenshot while still supporting email fallback when needed.

The Campaigns page was also updated to match the provided prototype more closely. It now uses the prototype-style top bar, Leads/Campaigns tabs, dark background, AI Retarget Suggestions section, card styling, button treatments, and responsive mobile layout instead of inheriting the older sidebar dashboard styling.

We also ran scenario testing for:

- Login desktop and mobile layout.
- SMS OTP step.
- Email fallback after SMS step.
- OTP verify redirect.
- Campaign search.
- Campaign status filter.
- AI cohort preview modal.
- AI campaign build modal.

All code-side visual and scenario checks are passing.

There are two client-side items still needed for final production readiness:

1. SMTP email configuration for email OTP fallback.
   Please confirm the production server SMTP relay can send SCL login emails, or provide external SMTP credentials. Required values:
   - sender email, for example `login@sclcapital.io`
   - SMTP host and port
   - SMTP username and password if external SMTP requires auth
   - secure TLS mode, usually `false` for port `587` and `true` for port `465`

   How to get it:
   - Use the production server SMTP relay at `127.0.0.1:25`, or ask the mail provider/hosting provider for SMTP credentials.
   - Confirm SPF/DKIM/DMARC records for the sender domain.
   - Send any SMTP password through a secure channel, not regular email or chat.

2. Original SCL logo/wordmark asset for exact pixel-perfect login matching.
   The current implementation recreates the SCL wordmark with CSS, which is close, but true pixel-perfect matching requires the original SVG or high-resolution transparent PNG used in the reference screenshot.

For AI features, please also confirm the preferred AI provider:

- Anthropic is the current recommended/default provider. Create a key at `https://console.anthropic.com`, enable billing, then provide the key securely so it can be added in Settings → Integrations as `anthropicApiKey`.
- OpenAI can be used as an optional fallback if preferred. Create a key at `https://platform.openai.com/api-keys` and provide it securely for `openaiApiKey`.

For Twilio, please make sure we have the account owner-approved production credentials and Messaging Service details:

- Account SID.
- Auth Token.
- Messaging Service SID.
- Confirmed A2P/10DLC Brand and Campaign approval.
- Webhooks configured to the production domain:
  - `https://app.sclcapital.io/api/webhooks/twilio/inbound`
  - `https://app.sclcapital.io/api/webhooks/twilio/status`

Once SMTP is confirmed and the original SCL logo asset is provided, we can close the remaining acceptance gap and perform the final production smoke test.

## 📌 Резюме (рус):

Клиенту нужно отправить, что Login и Campaigns визуально доработаны и сценарии прошли. Для полного закрытия нужны: рабочий SMTP/authorized sender email для email OTP, оригинальный SCL logo/wordmark asset для абсолютного pixel-perfect, подтверждение Anthropic/OpenAI ключа для AI функций и Twilio production credentials/A2P/webhooks.
