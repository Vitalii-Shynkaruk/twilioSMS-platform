# Frontend Audit Report — `client/`

**Date:** 2025-01-27
**Scope:** All files in `client/src/` — pages, components, services, stores, styles, types, config
**Total files audited:** 30+ source files

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 6     |
| HIGH     | 18    |
| MEDIUM   | 25    |
| LOW      | 16    |
| **Total** | **65** |

---

## CRITICAL

### C-01 · Auth store fails to set `initialized` on 401/403
**File:** `src/stores/authStore.ts` — `checkAuth()` method
**Impact:** After a 401/403 from `/auth/me`, the store sets `isAuthenticated: false` but never sets `initialized: true`. This causes the auth loading state to persist indefinitely, soft-locking the UI for logged-out users or users with expired tokens.
```ts
// Current: only sets initialized inside the success branch and the 5xx/offline branch
// Missing in the 401/403 branch (~line 73-82)
```

### C-02 · Hard redirect on token refresh failure bypasses React Router
**File:** `src/services/api.ts` — line ~36
**Impact:** `window.location.href = '/login'` causes a full page reload, destroying all client state (query cache, local UI state, unsaved form data). Should use the auth store's `logout()` or React Router's `navigate()`.
```ts
window.location.href = '/login'; // ← hard redirect
```

### C-03 · No phone number input validation
**Files:** `src/pages/LeadsPage.tsx` (CreateLeadModal), `src/pages/NumbersPage.tsx` (AddNumberModal)
**Impact:** Phone numbers are sent to the API as raw strings with no format validation. Users can submit garbage values (`abc`, `123`) that will either fail silently at Twilio or corrupt the database. The placeholder shows `+1XXXXXXXXXX` but no pattern is enforced. This is critical for an SMS platform.

### C-04 · WebSocket token sent in plain auth object, no reconnection strategy
**File:** `src/pages/InboxPage.tsx` — lines 56-76
**Impact:** The socket token is read from `localStorage` once at mount time. If the token refreshes mid-session, the WebSocket still uses the stale token. There's no reconnection/backoff logic — if the connection drops, it just sets `wsConnected = false` and the user gets degraded polling forever without notification.

### C-05 · Bulk number import uses recursive sequential API calls with no error handling
**File:** `src/pages/NumbersPage.tsx` — `AddNumberModal`, `handleBulkSubmit` (~line 1245)
**Impact:** Bulk import calls `api.post` sequentially one-by-one using recursion (`createNext(idx + 1)`). Errors are silently swallowed with `.catch(() => {})`. For 100+ numbers this creates a waterfall of individual requests with no progress UI, no abort mechanism, and no way to know which numbers failed.

### C-06 · No CSRF protection or rate limiting on client side
**Files:** `src/services/api.ts`, all mutation calls
**Impact:** All API calls use Bearer token auth with no CSRF token. The refresh token flow has no rate limit — a malicious script could hammer the refresh endpoint. Combined with storing tokens in `localStorage` (XSS-vulnerable), this is a significant security surface.

---

## HIGH

### H-01 · Massive page files with no component decomposition
**Files & sizes:**
- `src/pages/SettingsPage.tsx` — **1,469 lines** (6+ sub-components inline)
- `src/pages/NumbersPage.tsx` — **1,384 lines** (8+ sub-components inline)
- `src/pages/LeadsPage.tsx` — **1,197 lines** (4 sub-components inline)
- `src/pages/AutomationPage.tsx` — **938 lines**

**Impact:** These mega-files are unmaintainable. Every sub-component defined inline re-creates on parent re-render unless memoized, and none are memoized. The `components/` directories for `auth/`, `campaigns/`, `common/`, `dashboard/`, `inbox/`, and `pipeline/` are **all empty** — the architecture intended decomposition but it never happened.

### H-02 · Extensive use of `any` type across the codebase
**Files:** Nearly all page files
**Examples:**
- `LeadsPage.tsx`: `(err: any)`, `(r: any)`, `(rule: any)` throughout
- `SettingsPage.tsx`: `saveMutation: any`, all query responses untyped
- `AnalyticsPage.tsx`: `(c: any)`, `(n: any)`, `(e: any)`, `(rep: any)`
- `NumbersPage.tsx`: `(err: any)`, `(body: any)`, `(user: any)`
- `DashboardPage.tsx`: `diagData` uses untyped breakdown arrays

**Impact:** TypeScript's safety is effectively disabled for API responses. Misspelled property names, changed API shapes, and null values will all be runtime errors instead of compile-time catches.

### H-03 · No accessibility (a11y) implementation
**Files:** All pages and components
**Impact:** The entire application has zero accessibility support:
- No `aria-label` on any icon button (all those `<button>` elements with only an icon)
- No `aria-live` regions for dynamic content (toasts, real-time messages, loading states)
- No focus management on modal open/close (focus is not trapped in modals)
- No keyboard navigation for context menus, command palette result selection, or DnD
- No skip navigation link
- No `role` attributes on custom widgets (tabs in Settings, toggle switches)
- Custom toggle switches in `SettingsPage.tsx` have no `role="switch"` or `aria-checked`
- Color-only status indicators with no text fallback for color-blind users

### H-04 · InboxPage sidebar is fixed 380px, not responsive
**File:** `src/pages/InboxPage.tsx` — line 96
```tsx
<div className="w-[380px] flex flex-col border-r ...">
```
**Impact:** On screens narrower than ~800px, the conversation list consumes half the viewport and the message panel is unreadable. There is no mobile layout — no way to toggle between list and detail views. This is the most-used page for an SMS platform.

### H-05 · DashboardPage hardcodes `grid-cols-5`
**File:** `src/pages/DashboardPage.tsx` — stats grid section
**Impact:** The top-level stats grid uses `grid-cols-5` without responsive breakpoints. On tablet/mobile screens, cards collapse to unusable widths. Should use `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`.

### H-06 · Light theme relies on ~190 lines of `!important` overrides
**File:** `src/styles/globals.css` — lines 200-388
**Impact:** The `.light` theme works by overriding every component class with `!important` selectors. This is extremely fragile — any new component or utility class must have a corresponding light override added manually. A CSS variable-based approach (which is partially used) should be the sole mechanism.

### H-07 · LoginPage background is hardcoded, ignores theme
**File:** `src/pages/LoginPage.tsx` — line ~10
```tsx
<div className="min-h-screen flex flex-col items-center justify-center bg-[#060d1b] ...">
```
**Impact:** The login page always renders with a dark background regardless of theme setting. The inline styles throughout (`style={{ color: '#3a526d' }}`, `borderColor: 'rgba(40, 59, 82, 0.5)'`) bypass the CSS variable system.

### H-08 · LeadDetailDrawer hardcodes dark theme classes
**File:** `src/components/leads/LeadDetailDrawer.tsx`
**Impact:** Uses `bg-dark-900`, `bg-dark-800`, `text-dark-*` classes directly instead of CSS variables. Renders incorrectly in light theme.

### H-09 · No form validation beyond HTML `required`
**Files:** `LoginPage.tsx`, `LeadsPage.tsx` (CreateLeadModal), all create/edit modals
**Impact:** No client-side validation for:
- Email format
- Phone number format (E.164)
- Password strength
- Field length limits
- SMS message character limits (no warning at 160/1600 boundaries in campaign message fields)
- Numeric fields accept negative numbers or zero where inappropriate

### H-10 · `window.confirm` used for destructive actions
**Files:** `CampaignsPage.tsx`, `AutomationPage.tsx`, `PipelinePage.tsx`
**Impact:** Browser's native `window.confirm()` is used for delete/cancel operations. This is unstyled, cannot be themed, blocks the main thread, and provides no context about what will be deleted. `NumbersPage.tsx` properly uses a `ConfirmDeleteModal` — inconsistency suggests this was forgotten elsewhere.

### H-11 · Query responses are not typed through generics
**Files:** All pages using `useQuery`
**Impact:** Every `useQuery` call returns untyped `data` that requires casting or `any`. The `types/index.ts` file defines proper interfaces (`Lead`, `Campaign`, `Message`, etc.) but they're rarely used in query definitions. Should use `useQuery<DashboardStats>({ ... })` pattern.

### H-12 · No error boundaries around individual routes
**File:** `src/App.tsx`
**Impact:** A single `ErrorBoundary` wraps the entire app. If one page crashes (e.g., a chart library error on Analytics), the entire application shows the error screen. Each lazy-loaded route should have its own error boundary.

### H-13 · Empty component directories indicate abandoned architecture
**Directories:** `src/components/auth/`, `campaigns/`, `common/`, `dashboard/`, `inbox/`, `pipeline/`
**Impact:** Six empty directories suggest a planned component architecture that was never implemented. All components are defined inline in page files instead, leading to the mega-file problem (H-01).

### H-14 · Modals don't trap focus or handle Escape key consistently
**Files:** All modal components across all pages
**Impact:** Modals can be dismissed by clicking the backdrop (good), but:
- Focus is not trapped — Tab key moves focus behind the modal
- Escape key handling is inconsistent (some modals handle it, most don't)
- Body scroll is not locked when modals are open
- Multiple modals can stack without proper z-index management

### H-15 · `noUnusedLocals` and `noUnusedParameters` disabled
**File:** `tsconfig.json` — lines 15-16
```json
"noUnusedLocals": false,
"noUnusedParameters": false,
```
**Impact:** Dead code accumulates silently. These should be `true` in production codebases to catch unused imports, variables, and function parameters.

### H-16 · No ESLint configuration
**Impact:** No `.eslintrc`, `eslint.config.*`, or ESLint entry in `package.json`. The project has zero static analysis beyond TypeScript's type checker. React-specific lint rules (exhaustive-deps, rules-of-hooks) are not enforced.

### H-17 · CSS applies global border to all elements
**File:** `src/styles/globals.css` — line 55
```css
* {
  @apply border-dark-700;
}
```
**Impact:** Every single HTML element gets a default border color applied via the universal selector. This is a performance concern (applies to every element in the DOM) and causes unexpected visual artifacts on elements that shouldn't have borders.

### H-18 · TypeScript compile error in production code
**File:** `src/pages/pipeline/SortableStageColumn.tsx` — line 19
```
Cannot find module './SortableCard' or its corresponding type declarations.
```
**Impact:** This is a real TS error (likely a module resolution issue). The build command is `tsc && vite build`, meaning this would fail the production build.

---

## MEDIUM

### M-01 · No loading states for mutations
**Files:** Most mutation calls
**Impact:** When a user clicks "Delete", "Create", or "Save", there's no optimistic UI or loading indicator on the triggering button in many cases. Some modals properly disable the button with `isPending`, but inline actions (context menu items, tag operations) don't.

### M-02 · Context menus have no keyboard support
**Files:** `LeadsPage.tsx`, `InboxPage.tsx`, `PipelinePage.tsx`, `CampaignsPage.tsx`, `NumbersPage.tsx`
**Impact:** Custom right-click context menus are mouse-only. No keyboard navigation (arrow keys), no Escape to close, no screen reader support. These are complex interactive widgets that need proper ARIA roles.

### M-03 · Polling strategy is wasteful
**Files:** `DashboardPage.tsx` (30s), `InboxPage.tsx` (15s/8s), `AppLayout.tsx` (30s)
**Impact:** Multiple pages poll the API at fixed intervals even when the tab is in the background. React Query's `refetchOnWindowFocus` is disabled globally. Consider using `refetchIntervalInBackground: false` and enabling `refetchOnWindowFocus` for stale data.

### M-04 · No debounce on search inputs
**Files:** `LeadsPage.tsx`, `InboxPage.tsx`, `NumbersPage.tsx`, `SettingsPage.tsx`
**Impact:** Every keystroke in search fields triggers an API request immediately. For fast typists, this generates 5-10 unnecessary requests per search. Should debounce by 300-500ms.

### M-05 · Campaign message textarea has no character counter or segment warning
**File:** `src/pages/CampaignsPage.tsx`, `src/pages/CampaignDetailPage.tsx`
**Impact:** SMS messages are limited to 160 characters per segment (70 for Unicode). Users have no visibility into message length or how many segments their message will consume, directly impacting SMS costs.

### M-06 · Unread count only checks first page of conversations
**File:** `src/components/layout/AppLayout.tsx`
**Impact:** The inbox badge shows unread count from a single API call, but if the count exceeds one page of results, it may undercount. The query fetches conversations and counts client-side rather than using a dedicated count endpoint.

### M-07 · No optimistic updates for drag-and-drop operations
**File:** `src/pages/PipelinePage.tsx`
**Impact:** When dragging a card between pipeline stages, the mutation fires and the UI waits for the server response before the query is invalidated. During this time, cards can snap back to their original position momentarily, creating a jarring experience.

### M-08 · Inbox auto-marks conversations as read immediately
**File:** `src/pages/InboxPage.tsx`
**Impact:** Selecting a conversation immediately sends a "mark as read" mutation. If the user is scanning through conversations, every click triggers a write. Should debounce or wait for user to actually view the messages (e.g., 2 second delay).

### M-09 · Tables lack horizontal scroll on small screens
**Files:** `AnalyticsPage.tsx`, `SettingsPage.tsx`, `AutomationPage.tsx`
**Impact:** Tables with many columns overflow their containers on smaller screens. Some tables have `overflow-x-auto` on the wrapper, but many don't.	Some pages that do have it still have parent containers that constrain the scroll area.

### M-10 · No confirmation before marking leads as DNC
**File:** `src/pages/LeadsPage.tsx`
**Impact:** DNC (Do Not Call) is a serious compliance action that permanently suppresses a lead. The status change happens via a simple select dropdown with no confirmation dialog asking "Are you sure? This lead will never receive messages again."

### M-11 · `tailwind-merge` in dependencies but no `cn()` utility
**File:** `package.json`
**Impact:** `tailwind-merge` is installed but there's no shared `cn()` utility function (the standard pattern is `cn = (...args) => twMerge(clsx(args))`). The codebase uses `clsx` directly everywhere, making `tailwind-merge` an unused dependency.

### M-12 · Socket.IO connection created per-page instead of globally
**File:** `src/pages/InboxPage.tsx`
**Impact:** A new WebSocket connection is created every time InboxPage mounts and destroyed on unmount. Navigating away and back creates a new connection. Should be a global singleton (via context or store) so real-time updates work across all pages.

### M-13 · No pagination on campaign detail leads table
**File:** `src/pages/CampaignDetailPage.tsx`
**Impact:** The campaign detail page fetches ALL leads for a campaign via `?limit=5000` and renders them in a single table. For campaigns with thousands of leads, this will cause major performance issues and potentially crash the tab.

### M-14 · CSV import limited to 200 leads for campaign creation
**File:** `src/pages/CampaignsPage.tsx` — CreateCampaignModal
```tsx
const { data } = await api.get('/leads?limit=200');
```
**Impact:** Only the first 200 leads are shown when selecting leads for a campaign. Users with larger lead lists cannot select leads beyond this limit.

### M-15 · No retry UI for failed API calls
**Files:** All page-level queries
**Impact:** When API calls fail, pages show a static error message with a "Retry" or "Reload" button that refreshes the whole page. React Query supports automatic retries (configured to 1), but there's no in-place retry button that calls `refetch()`.

### M-16 · `framer-motion` imported but barely used
**File:** `package.json`
**Impact:** `framer-motion` is a ~30KB (gzipped) dependency. It's imported in `package.json` but actual usage in the codebase is minimal or absent. The codebase uses CSS transitions and Tailwind animations instead. Should be removed or used consistently.

### M-17 · Command Palette only navigates, no actions
**File:** `src/components/layout/AppLayout.tsx`
**Impact:** The Cmd+K command palette only supports navigation (go to page). It could support actions like "Create Lead", "New Campaign", "Search Leads by phone", etc. Also, no arrow key navigation in results — only Enter selects the first match.

### M-18 · Inline styles used extensively alongside CSS variables
**Files:** `AppLayout.tsx`, `InboxPage.tsx`, `AnalyticsPage.tsx`, `LoginPage.tsx`
**Impact:** Many components use `style={{ backgroundColor: 'var(--bg-secondary)' }}` instead of Tailwind classes. This creates inconsistency — sometimes it's a class, sometimes inline. Should define Tailwind utilities that map to CSS variables.

### M-19 · `ProtectedRoute` re-triggers auth check on every navigation
**File:** `src/App.tsx` — `ProtectedRoute` component
**Impact:** Each navigation to a protected route triggers `checkAuth()` if `!initialized`. This should be done once at app startup, not per-route. If the auth check is slow, every page transition shows a loading spinner.

### M-20 · Campaign list pagination resets when status filter changes
**File:** `src/pages/CampaignsPage.tsx`
**Impact:** The page state doesn't reset to 1 when the status filter changes. If the user is on page 5 and changes the filter, they'll see page 5 of the new filter results (which may be empty).

### M-21 · No AbortController for search requests
**Files:** All search-related queries
**Impact:** Rapid typing fires multiple concurrent requests. Old results may arrive after new results, showing stale data. React Query handles this for identical keys, but changing search terms creates different keys that can overlap.

### M-22 · Build output not chunked by route
**File:** `vite.config.ts`
**Impact:** While React.lazy is used for code splitting, Vite's default chunking strategy may bundle shared dependencies suboptimally. No `manualChunks` configuration is present for vendor splitting (e.g., separating recharts, dnd-kit, socket.io).

### M-23 · Hardcoded `bg-dark-850` class used in pipeline cards
**File:** `src/pages/pipeline/SortableCard.tsx` — line 39
**Impact:** The card background uses the Tailwind class `bg-dark-850` directly rather than a CSS variable, breaking in light theme.

### M-24 · No loading skeleton for pipeline board
**File:** `src/pages/PipelinePage.tsx`
**Impact:** While a basic loading state exists, it's a simple "Loading..." text. Other pages (Dashboard, Numbers) have proper loading skeletons. The pipeline board should show placeholder columns and cards.

### M-25 · Number pools section partially visible
**File:** `src/pages/NumbersPage.tsx`
**Impact:** The Number Pools section is rendered as a collapsible at the bottom of the Numbers tab, but it's easy to miss. This is a critical feature for SMS rotation that deserves more prominent placement.

---

## LOW

### L-01 · Console-level error handling inconsistency
**Files:** Various
**Impact:** Some error handlers show `err.response?.data?.error`, others show `err.message`, and a few just show hardcoded strings like `'Failed'`. Should standardize error message extraction.

### L-02 · Date formatting inconsistency
**Files:** Various pages
**Impact:** Some dates use `format()` from date-fns, others use `new Date().toLocaleDateString()`, and others use `new Date().toLocaleString()`. Should use a consistent formatting utility.

### L-03 · `react-dropzone` in dependencies but not used for file upload
**File:** `package.json`, `src/pages/LeadsPage.tsx`
**Impact:** `react-dropzone` is installed but the CSV import in `LeadsPage.tsx` uses a manual drag-and-drop implementation with native events instead of the library.

### L-04 · No favicon or meta tags for the app
**File:** `index.html` (would need to check)
**Impact:** Missing or generic favicon/meta description affects browser tab identification and SEO (if applicable).

### L-05 · `border-l-2` on active sidebar link creates asymmetric padding
**File:** `src/styles/globals.css` — `.sidebar-link.active`
**Impact:** The active state adds a left border that shifts content by 2px. Non-active links don't have this border, causing a visual shift when navigating.

### L-06 · No transition on theme toggle
**Files:** `src/stores/themeStore.ts`, `src/styles/globals.css`
**Impact:** Theme changes are applied instantly with no transition animation. The jump between dark and light is jarring. Adding `transition: background-color 200ms, color 200ms` on `body` would smooth it.

### L-07 · Inconsistent empty state messaging
**Files:** Various pages
**Impact:** Empty states range from detailed messages with CTAs (NumbersPage, PipelinePage) to bare "No data" text (some Analytics sections). Should standardize on a shared EmptyState component.

### L-08 · `getStoredViewMode` doesn't match the allowed types used in PipelinePage
**File:** `src/pages/pipeline/utils.ts`
**Impact:** The utility includes `'grid-4'` in the allowed list, but the PipelinePage only exposes board/grid-2/grid-3 in its UI. `grid-4` is inaccessible but technically valid if set in localStorage.

### L-09 · SortableStageColumn has duplicate menu items
**File:** `src/pages/pipeline/SortableStageColumn.tsx` — lines 133-136
**Impact:** The stage dropdown menu has "Rename Stage" and "Change Color" as separate buttons, but both call `onEdit` which opens the same modal. They should be a single "Edit Stage" item.

### L-10 · No `aria-label` on the mobile hamburger button
**File:** `src/components/layout/AppLayout.tsx` — line 319
**Impact:** The mobile menu button has no accessible name. Screen readers will announce it as just "button".

### L-11 · Magic numbers throughout
**Files:** Various
**Impact:** Hardcoded values like `380px`, `300px`, `5000`, `200`, `50`, `30000`, `15000` appear without named constants. Makes it hard to understand intent or adjust consistently.

### L-12 · No `Suspense` fallback customization per route
**File:** `src/App.tsx`
**Impact:** All lazy-loaded routes share the same generic loading spinner. Route-specific skeleton screens would provide better perceived performance.

### L-13 · Copyright text hardcodes "Secure Credit Lines"
**File:** `src/pages/LoginPage.tsx` — line 152
**Impact:** Brand name is hardcoded in the footer. Should be in a config or environment variable for reusability.

### L-14 · No breadcrumb navigation
**Files:** `CampaignDetailPage.tsx`, nested pages
**Impact:** Users navigating to campaign details or deep settings have no breadcrumb trail showing their location. The sidebar highlights help, but breadcrumbs improve navigation UX.

### L-15 · `SortableCard` applies listeners/attributes to root div
**File:** `src/pages/pipeline/SortableCard.tsx` — lines 50-51
**Impact:** The entire card is the drag handle, which means text selection within cards is impossible. The `GripVertical` icon exists visually but doesn't serve as the actual drag handle.

### L-16 · Query keys are plain strings, not organized
**Files:** All pages
**Impact:** Query keys use ad-hoc strings (`'leads'`, `'conversations'`, `'pipeline'`). Should use a query key factory pattern for consistent invalidation and avoiding key collisions.

---

## Build & Config Issues

| Issue | File | Severity |
|-------|------|----------|
| TS error: cannot find module `SortableCard` | `pipeline/SortableStageColumn.tsx` L19 | HIGH |
| `noUnusedLocals: false` allows dead code | `tsconfig.json` L15 | HIGH |
| `noUnusedParameters: false` allows dead params | `tsconfig.json` L16 | HIGH |
| No ESLint config found | project root | HIGH |
| No `manualChunks` for vendor code splitting | `vite.config.ts` | MEDIUM |
| `tailwind-merge` installed but unused | `package.json` | LOW |
| `react-dropzone` installed but unused | `package.json` | LOW |
| `framer-motion` installed, minimal usage | `package.json` | MEDIUM |

---

## Architecture Recommendations

1. **Extract sub-components** from mega-files into the empty `components/` directories. Target: no file over 400 lines.
2. **Create a shared utility layer**: `cn()` function, error message extractor, date formatter, phone formatter.
3. **Type all API calls** using generics: `useQuery<LeadResponse>({ ... })`.
4. **Implement a global WebSocket** context that all pages can subscribe to.
5. **Replace CSS `!important` overrides** with a complete CSS variable system.
6. **Add ESLint** with `eslint-plugin-react`, `eslint-plugin-react-hooks`, and `@typescript-eslint`.
7. **Add accessibility** incrementally: start with aria-labels on icon buttons, focus trapping in modals, and keyboard navigation for context menus.
8. **Create a shared Modal component** with focus trap, Escape handling, body scroll lock, and consistent backdrop behavior.
9. **Add input validation**: phone E.164 format, email regex, message length counters.
10. **Add route-level error boundaries** using React Router's `errorElement`.

---

*End of audit.*
