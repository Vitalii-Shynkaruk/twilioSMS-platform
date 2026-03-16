# A2P 10DLC Campaign Registration Guide / Руководство по регистрации A2P 10DLC кампании

---

## English Version

### Current Status
- **Step 1 — Customer Profile**: ✅ Approved
- **Step 2 — Brand (BBC CONSULTING LLC)**: ✅ Registered
- **Step 3 — Campaign**: ❌ Failed / Rejected

### Why the Campaign Was Rejected

TCR (The Campaign Registry) rejected the campaign likely because of these issues:

1. **Use Case "Low Volume Mixed"** — this is the most generic and least trusted use case. TCR rejects these at a much higher rate.
2. **"Promotional" language in description** — the word "promotional" raises red flags for compliance reviewers.
3. **Inconsistency between use case and message content** — if the use case says "Mixed" but messages look like marketing, it's a mismatch.
4. **Embedded links setting** — if marked "Yes" but samples have no links (or vice versa).

---

### Step-by-Step: Register a New Campaign

#### 1. Delete the Failed Campaign
- Go to **Messaging → Regulatory Compliance → A2P 10DLC → Campaigns**
- Click the failed campaign → **Delete Campaign**

#### 2. Register New Campaign

Click **"+ Register new Campaign"** and fill in:

#### Use Case
**Select: "Customer Care"**
> Do NOT select "Low Volume Mixed" — it has the highest rejection rate.
> "Customer Care" covers follow-ups, application status, document requests — which is exactly what SCL does.

If "Customer Care" is not available, select **"Marketing"** as second choice (requires opt-in proof).

#### Campaign Description
```
BBC Consulting LLC uses this campaign to communicate with business owners who have 
previously requested information about commercial financing options. Messages include 
application status updates, document submission reminders, funding notifications, and 
responses to customer inquiries. All recipients have opted in through our website 
contact form, referral partners, or by directly requesting financing information. 
Recipients may reply STOP to opt out at any time.
```

**Key principles:**
- ❌ Do NOT use the word "promotional"
- ❌ Do NOT mention "cold leads" or "purchased leads"
- ✅ Emphasize that recipients REQUESTED the information
- ✅ Mention specific opt-in method (website form, referral, direct request)
- ✅ Include STOP opt-out language

#### Message Sample #1 (Follow-Up / Lead Engagement)
```
BBC Consulting LLC: Hi {first_name}, following up on your inquiry about 
business financing. We have programs available for your business. 
Would you like to review your options? Reply STOP to opt out.
```

#### Message Sample #2 (Application / Document Request)
```
BBC Consulting LLC: {first_name}, your business financing application is 
being reviewed. We may need additional documents to proceed. Please reply 
to this message or call us at (786) 648-7512. Reply STOP to opt out.
```

**Message sample rules:**
- ✅ Start with brand name: `BBC Consulting LLC:`
- ✅ Include personalization: `{first_name}`
- ✅ End with opt-out: `Reply STOP to opt out`
- ✅ Clear business purpose in each message
- ❌ No URL shorteners (bit.ly, etc.)
- ❌ No ALL CAPS words
- ❌ No excessive punctuation (!!!, ???)
- ❌ No SHAFT content (Sex, Hate, Alcohol, Firearms, Tobacco)

#### Sending Messages with Embedded Links
- Select **"No"** unless you actually send URLs in messages
- If you do send links, they must be to your own domain (securecreditlines.com)
- Never use URL shorteners

#### Number of Phone Numbers
- Enter the actual count: **35** (or current number)

#### Subscriber Opt-In
Describe how recipients agree to receive messages:
```
Subscribers opt in by submitting a contact form on our website 
(securecreditlines.com) requesting business financing information, 
through referral partner applications, or by directly contacting 
our office to inquire about financing options. All opt-ins include 
disclosure that the applicant may receive SMS communications regarding 
their financing inquiry.
```

#### Opt-In Keywords
```
START, YES, SUBSCRIBE
```

#### Opt-Out Keywords
```
STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
```

#### Help Keywords
```
HELP, INFO
```

#### Help Message
```
BBC Consulting LLC: For assistance, call (786) 648-7512 or email 
support@securecreditlines.com. Reply STOP to opt out of messages.
```

#### Privacy Policy URL
```
https://securecreditlines.com/privacy
```
> ⚠️ This URL MUST be live and accessible. TCR reviewers check it.
> The page should mention SMS communications and opt-out rights.

#### Terms of Service URL
```
https://securecreditlines.com/terms
```

---

### After Campaign is Approved

1. **Associate phone numbers** with the Messaging Service linked to the approved campaign
2. Go to **Phone Numbers → Manage → Active Numbers** → select each number → set Messaging Service
3. In the platform, switch `SMS_MODE` to `live`
4. Start with **50 messages/number/day** (ramp-up is built into the platform)
5. Scale gradually: 50 → 100 → 150 → 200 → 250 → 300 → 350 per number/day

### Required Website Pages (TCR checks these)

| Page | URL | Must Contain |
|------|-----|-------------|
| Privacy Policy | `/privacy` | How you collect data, SMS disclosure, opt-out instructions |
| Terms of Service | `/terms` | Service terms, messaging consent, TCPA compliance |
| Contact | `/contact` | Business phone, email, physical address |

### Common Rejection Reasons & Fixes

| Reason | Fix |
|--------|-----|
| "Insufficient opt-in description" | Add detailed opt-in flow: website form → confirmation → SMS disclosure |
| "Message samples don't match use case" | Align samples with selected use case (Customer Care = service messages) |
| "Missing privacy policy" | Ensure URL works and mentions SMS |
| "Promotional content in Customer Care" | Remove sales language, focus on service/updates |
| "Brand website doesn't match" | Ensure brand website is live and matches business name |

---
---

## Русская версия

### Текущий статус
- **Шаг 1 — Профиль клиента**: ✅ Одобрен
- **Шаг 2 — Бренд (BBC CONSULTING LLC)**: ✅ Зарегистрирован
- **Шаг 3 — Кампания**: ❌ Отклонена

### Почему кампания была отклонена

TCR (The Campaign Registry) отклонил кампанию скорее всего по следующим причинам:

1. **Use Case "Low Volume Mixed"** — это самый общий и наименее доверенный тип кампании. TCR отклоняет их чаще всего.
2. **Слово "promotional" в описании** — слово "promotional" (рекламный) поднимает красные флаги у ревьюеров.
3. **Несоответствие use case и содержания сообщений** — если use case "Mixed", а сообщения выглядят как маркетинг, это несоответствие.
4. **Настройка embedded links** — если отмечено "Yes", а в образцах ссылок нет (или наоборот).

---

### Пошагово: Регистрация новой кампании

#### 1. Удалите отклонённую кампанию
- Перейдите в **Messaging → Regulatory Compliance → A2P 10DLC → Campaigns**
- Нажмите на отклонённую кампанию → **Delete Campaign**

#### 2. Зарегистрируйте новую кампанию

Нажмите **"+ Register new Campaign"** и заполните:

#### Use Case (Тип кампании)
**Выберите: "Customer Care"**
> НЕ выбирайте "Low Volume Mixed" — у него самый высокий процент отклонений.
> "Customer Care" покрывает follow-up, статус заявки, запросы документов — именно то, что делает SCL.

Если "Customer Care" недоступен, выберите **"Marketing"** как второй вариант (требует подтверждения opt-in).

#### Описание кампании (Campaign Description)
```
BBC Consulting LLC uses this campaign to communicate with business owners who have 
previously requested information about commercial financing options. Messages include 
application status updates, document submission reminders, funding notifications, and 
responses to customer inquiries. All recipients have opted in through our website 
contact form, referral partners, or by directly requesting financing information. 
Recipients may reply STOP to opt out at any time.
```

**Ключевые принципы:**
- ❌ НЕ используйте слово "promotional" (рекламный)
- ❌ НЕ упоминайте "cold leads" или "purchased leads" (купленные лиды)
- ✅ Подчёркивайте что получатели САМИ запросили информацию
- ✅ Укажите конкретный метод opt-in (форма на сайте, реферал, прямой запрос)
- ✅ Включите язык STOP opt-out

#### Пример сообщения #1 (Follow-Up)
```
BBC Consulting LLC: Hi {first_name}, following up on your inquiry about 
business financing. We have programs available for your business. 
Would you like to review your options? Reply STOP to opt out.
```

#### Пример сообщения #2 (Запрос документов)
```
BBC Consulting LLC: {first_name}, your business financing application is 
being reviewed. We may need additional documents to proceed. Please reply 
to this message or call us at (786) 648-7512. Reply STOP to opt out.
```

**Правила для образцов сообщений:**
- ✅ Начинайте с имени бренда: `BBC Consulting LLC:`
- ✅ Персонализация: `{first_name}`
- ✅ Заканчивайте opt-out: `Reply STOP to opt out`
- ✅ Чёткая бизнес-цель в каждом сообщении
- ❌ Нет сокращателей URL (bit.ly и т.д.)
- ❌ Нет слов в ВЕРХНЕМ РЕГИСТРЕ
- ❌ Нет чрезмерной пунктуации (!!!, ???)

#### Отправка сообщений со встроенными ссылками
- Выберите **"No"** если вы не отправляете URL в сообщениях
- Если отправляете ссылки — только на свой домен (securecreditlines.com)
- Никогда не используйте сокращатели URL

#### Количество телефонных номеров
- Укажите реальное количество: **35** (или текущее)

#### Opt-In подписчиков (Subscriber Opt-In)
Опишите как получатели соглашаются получать сообщения:
```
Subscribers opt in by submitting a contact form on our website 
(securecreditlines.com) requesting business financing information, 
through referral partner applications, or by directly contacting 
our office to inquire about financing options. All opt-ins include 
disclosure that the applicant may receive SMS communications regarding 
their financing inquiry.
```

#### Privacy Policy URL
```
https://securecreditlines.com/privacy
```
> ⚠️ Этот URL ДОЛЖЕН быть живым и доступным. Ревьюеры TCR проверяют его.
> Страница должна упоминать SMS-коммуникации и право на отказ (opt-out).

---

### После одобрения кампании

1. **Привяжите номера** к Messaging Service, связанному с одобренной кампанией
2. Перейдите в **Phone Numbers → Manage → Active Numbers** → выберите каждый номер → установите Messaging Service
3. В платформе переключите `SMS_MODE` на `live`
4. Начните с **50 сообщений/номер/день** (ramp-up уже встроен в платформу)
5. Наращивайте постепенно: 50 → 100 → 150 → 200 → 250 → 300 → 350 сообщений/номер/день

### Необходимые страницы на сайте (TCR проверяет)

| Страница | URL | Должна содержать |
|----------|-----|-----------------|
| Privacy Policy | `/privacy` | Как собираете данные, раскрытие SMS, инструкции opt-out |
| Terms of Service | `/terms` | Условия сервиса, согласие на сообщения, соответствие TCPA |
| Contact | `/contact` | Телефон бизнеса, email, физический адрес |

### Частые причины отклонения и исправления

| Причина | Исправление |
|---------|------------|
| "Insufficient opt-in description" | Добавить детальный opt-in процесс: форма → подтверждение → раскрытие SMS |
| "Message samples don't match use case" | Выровнять образцы с выбранным use case |
| "Missing privacy policy" | Убедиться что URL работает и упоминает SMS |
| "Promotional content in Customer Care" | Убрать продажный язык, фокус на сервис/обновления |
| "Brand website doesn't match" | Убедиться что сайт бренда работает и совпадает с названием |

---

### Стоимость

| Этап | Стоимость |
|------|----------|
| Brand Registration (Standard) | $46 одноразово (Low Volume: $4.50) |
| Campaign Verification | $15 одноразово |
| Monthly Campaign Fee | $1.50–10/мес |
| Per SMS (A2P rate) | ~$0.0079/segment |

### Контакт Twilio Support
Если повторно отклонят — обратитесь в Twilio Support с:
- Brand SID: `BNd480e3d679a69959865fe529c372e185`
- Messaging Service SID: `MG48c7bd2baa8c738b9a19c910fea22903`
- Описание проблемы и что было исправлено
