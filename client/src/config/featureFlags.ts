// © BuyReadySite.com — Feature flags для Phase 1/Phase 2 разделения.
//
// PHASE1_LEAN (default false):
//   Включает «classifier-validation-only» режим Phase 1 по решению клиента 23.04.2026.
//   В нём видно только: classification badge в thread header, revenue chip на inbox card,
//   AI Priority sort. Остальные AI-фичи (banner, BEST/ALT suggestions, HOT toast,
//   HOT SMS alerts, score bar, HOT badge на card) временно СКРЫТЫ, но код оставлен
//   в репозитории — вернётся в Phase 2.
//
//   Управление без деплоя: в client/.env.local поставить VITE_PHASE1_LEAN=true,
//   чтобы временно вернуться в lean-режим.
const raw = (import.meta.env.VITE_PHASE1_LEAN ?? 'false').toString().toLowerCase();
export const PHASE1_LEAN = raw !== 'false' && raw !== '0';
