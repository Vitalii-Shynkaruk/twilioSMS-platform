# Dashboard removal — client-confirmed evidence

Прикладывается к письму клиенту в ответ на «дашборд пропал».

5 источников, все подтверждены клиентом 20.04.2026 в Build Plan v1.1:

| #   | Скрин               | Цитата                                                                                                                |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 01-sidebar.png      | Sidebar table → "Dashboard merges into Command Center"                                                                |
| 2   | 02-gap-analysis.png | Gap-analysis row #16 → "Dashboard → Command Center merge / Page merge + route delete"                                 |
| 3   | 03-removed.png      | "Removed. SMS metrics merged into Command Center bottom section." + "/dashboard Deleted. Redirect to /command-center" |
| 4   | 04-acceptance.png   | Acceptance test N1: "Dashboard removed → Redirect to Command Center. No sidebar item."                                |
| 5   | 05-prototype.png    | Approved prototype scl-inbox-v5.html sidebar nav — Dashboard отсутствует                                              |

Все Dashboard SMS-метрики живут внутри Command Center (SmsBar, client/src/pages/CommandCenterPage.tsx).
`/dashboard` URL-ы редиректят на `/command-center`.
