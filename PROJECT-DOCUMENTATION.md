# Project Documentation — Operational Knowledge Portal (bihs 7134)

**Document Version:** 1.0  
**Last Updated:** March 2025  
**Project:** BIHS 7134 — School Portal for Unit 7134 (Hebrew: צוות אלפא 7134)

---

## Table of Contents

1. [Project Overview & Tech Stack](#1-project-overview--tech-stack)
2. [Architecture & Folder Structure](#2-architecture--folder-structure)
3. [Frontend (React)](#3-frontend-react)
4. [Backend & API](#4-backend--api)
5. [Core Functionality & Business Logic](#5-core-functionality--business-logic)
6. [Integrations & Third-Party Services](#6-integrations--third-party-services)
7. [Setup & Installation](#7-setup--installation)

---

## 1. Project Overview & Tech Stack

### 1.1 What the Application Does

The **Operational Knowledge Portal** is an internal, Hebrew (RTL) web application for **Unit 7134** (BIHS — School). It serves as a single entry point for:

- **Public-facing home page:** Rotating hero background, commander’s message, monthly events (“מופעי החודש”), and dynamic navigation categories with flip cards that expose links to internal resources (trainings, operations, HQ, unit graph, gallery, safety, etc.).
- **Admin area:** Management of **events** (date, title, subtitle, status/color) and **navigation structure** (categories → cards → links), plus an optional **manual backup** of system data when running against SharePoint.

Data is **not** stored in a traditional database. In **development**, the app uses **localStorage** (mock mode). In **production**, it reads and writes **JSON files** stored in **Microsoft SharePoint** (e.g. under `SiteAssets`), so the “backend” is SharePoint’s REST API, not a custom Node/Express server.

### 1.2 Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Frontend framework** | React 19.x |
| **Build tool** | Vite 7.x |
| **Routing** | React Router DOM 7.x |
| **Styling** | Tailwind CSS 3.x, custom CSS (`index.css`, `App.css`) |
| **Fonts** | Google Fonts — Heebo (Hebrew) |
| **Icons** | lucide-react |
| **State management** | React Context API (Auth, Navigation, Events) — no Redux/Zustand |
| **Data (dev)** | Browser localStorage (mock) |
| **Data (production)** | Microsoft SharePoint REST API (JSON files in SiteAssets) |
| **Language / direction** | Hebrew, RTL |
| **Linting** | ESLint 9 (JS recommended, react-hooks, react-refresh) |

### 1.3 Dependencies (from `package.json`)

**Production:**

- `react`, `react-dom` — UI
- `react-router-dom` — client-side routing
- `lucide-react` — icon set

**Development:**

- `vite`, `@vitejs/plugin-react` — build and HMR
- `tailwindcss`, `postcss`, `autoprefixer` — CSS
- `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` — linting
- `@types/react`, `@types/react-dom` — TypeScript type definitions (optional)

---

## 2. Architecture & Folder Structure

### 2.1 High-Level Architecture

- **Single-page application (SPA):** One React app; no separate backend codebase.
- **Data layer:**  
  - **Mock:** Services read/write to `localStorage` using keys from `sharepoint.config.js`.  
  - **Production:** Services call SharePoint REST endpoints to get/update JSON files (events, navigation, users) and use `sharepointUtils.js` for Form Digest and backup.
- **Auth:** Session-based (sessionStorage) with optional SharePoint current-user detection; admin list comes from UsersService (mock or SharePoint file).

```
┌─────────────────────────────────────────────────────────────────┐
│                        React SPA (Vite)                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ AuthContext │  │ Navigation   │  │ EventsContext           │  │
│  │             │  │ Context      │  │                         │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬────────────┘  │
│         │                │                        │               │
│         ▼                ▼                        ▼               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │UsersService │  │NavigationSvc  │  │ EventsService           │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬────────────┘  │
│         │                │                        │               │
└─────────┼────────────────┼────────────────────────┼──────────────┘
          │                │                        │
          ▼                ▼                        ▼
   ┌──────────────┐  Mock: localStorage   Production: SharePoint REST
   │ sessionStorage│  (bihs_*_data keys)   (GetFileByServerRelativeUrl,
   │ + SP currentuser                     contextinfo, folders)
   └──────────────┘
```

### 2.2 Folder Structure

```
bihs 7134/
├── public/
│   ├── logo.svg
│   ├── logo_1734_rmbg.png          # Favicon & hero logo
│   └── images/
│       ├── פורטרט.png              # (legacy) Commander portrait
│       ├── אייל זמיר.png           # Commander portrait (current)
│       ├── לח1.jpeg … לח7.jpg       # Hero background images
│       └── …
├── src/
│   ├── main.jsx                    # Entry: BrowserRouter → Auth → Nav → Events → App
│   ├── App.jsx                     # Routes, Home, FlipCard
│   ├── App.css
│   ├── index.css                   # Tailwind, Heebo, RTL, grid, scrollbar, animations
│   ├── components/
│   │   ├── AdminHub.jsx            # Admin layout, sidebar, backup, nested routes
│   │   ├── AdminEvents.jsx         # Events CRUD + display count
│   │   ├── AdminNavigation.jsx     # Navigation tree editor
│   │   ├── EventsList.jsx          # Monthly events list (home)
│   │   ├── DynamicIcon.jsx         # Lucide icon by name
│   │   └── FlipCard.jsx            # Standalone flip card (not used by App; App uses inline)
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   ├── NavigationContext.jsx
│   │   └── EventsContext.jsx
│   ├── services/
│   │   ├── UsersService.js
│   │   ├── NavigationService.js
│   │   └── EventsService.js
│   ├── config/
│   │   └── sharepoint.config.js
│   └── utils/
│       └── sharepointUtils.js
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── package.json
├── .gitignore
├── README.md
├── מסמך-תיעוד-מערכת.md            # Hebrew system doc
└── PROJECT-DOCUMENTATION.md        # This file
```

**Example / backup files (not used at runtime):**

- `AuthProviderEXAMPLE.jsx`, `SharePointServiceEXAMPLE.txt`, `app.jsx.backup`, `react vite.html`

### 2.3 Separation of Concerns

| Concern | Location |
|---------|----------|
| Routing | `App.jsx` (Routes), `AdminHub.jsx` (nested `/admin/*`) |
| UI (home) | `App.jsx` (Home, FlipCard), `EventsList.jsx` |
| Admin UI | `AdminHub.jsx`, `AdminEvents.jsx`, `AdminNavigation.jsx` |
| Global state | `context/*` — Auth, Navigation, Events |
| Data access | `services/*` — abstract mock vs SharePoint |
| Environment / feature flags | `config/sharepoint.config.js` |
| SharePoint tokens & backup | `utils/sharepointUtils.js` |

---

## 3. Frontend (React)

### 3.1 Entry Point and Provider Tree

**`src/main.jsx`**

- Renders into `#root` with `createRoot`.
- Wraps app in: `StrictMode` → `BrowserRouter` → `AuthProvider` → `NavigationProvider` → `EventsProvider` → `App`.

Order matters: Auth loads first (and fetches users for admin check), then Navigation and Events load their data on mount.

### 3.2 Core React Components and Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **App** | Defines top-level routes: `/` → Home, `/admin/*` → AdminHub. Exports `FlipCard` and renders `Home`. |
| **Home** | Full home page: rotating hero backgrounds, navbar (logo, nav links from context, search placeholder, “ניהול” button, greeting + user), hero block (logo, title, description), bottom panels (“דבר המפקד”, “מופעי החודש”), and below-hero sections of navigation categories with FlipCards. |
| **FlipCard** (in App.jsx) | Card with front (icon, title, “לכניסה”) and back (title, list of `subLinks`). Click: if `url` set, opens in new tab; else toggles flip. Used for each category child on the home page. |
| **EventsList** | Consumes `useEvents()`; shows sorted, sliced events with optional auto-rotation every 6s; Hebrew date formatting (day + month); styling by `event.color` (red/gray). |
| **AdminHub** | Admin layout: collapsible sidebar (Events, Navigation, Back to site, Backup), main content area with nested `<Routes>` for `/admin` (AdminEvents) and `/admin/navigation` (AdminNavigation). Calls `createBackup()` when not in mock. |
| **AdminEvents** | Events management: display count (2–5), grid of event cards (date, title, subtitle, status), add/edit/delete; modal form for create/edit; persists via `saveEvents` from EventsContext. |
| **AdminNavigation** | Navigation tree manager: sidebar tree (root → categories → sub-cards), breadcrumb, search, properties panel (name, Lucide icon name, URL), table with inline edit and add/remove; persists via `saveNavigation` from NavigationContext. |
| **DynamicIcon** | Renders a Lucide icon by string `name`; fallback `HelpCircle` if name not found. |
| **FlipCard.jsx** | Standalone version of FlipCard; logic matches the one in App.jsx but is not imported in App (App uses its own definition). |

### 3.3 State Management (Context API)

No Redux or Zustand. Three contexts:

| Context | Provided value | Purpose |
|---------|----------------|--------|
| **AuthContext** | `currentUser`, `isAdmin`, `loading`, `signIn`, `signOut`, `trySharePointLogin` | User identity and admin flag; sessionStorage + optional SharePoint current user. |
| **NavigationContext** | `navItems`, `loading`, `error`, `saveNavigation`, `fetchNavigation` | Navigation tree for navbar and home sections; load once on mount, save from admin. |
| **EventsContext** | `events`, `displayCount`, `loading`, `error`, `saveEvents`, `fetchEvents` | Events and display count; load on mount, auto-refresh every 60s, save from admin. |

State is held in context providers; services are called from context and from components (e.g. AdminEvents/AdminNavigation call `save*` with local state, then context updates after successful save).

### 3.4 Routing Structure

| Route | Component | Notes |
|-------|------------|--------|
| `/` | Home | Main portal page. |
| `/admin` | AdminHub → AdminEvents | Events management. |
| `/admin/navigation` | AdminHub → AdminNavigation | Navigation structure editor. |

- No route guards: “ניהול” links to `/admin` regardless of `isAdmin` (documentation notes that protecting admin by role is recommended).
- Nested routes are defined inside `AdminHub` with `<Routes>` and `<Route path="/" … />`, `<Route path="/navigation" … />` (paths relative to `/admin`).

---

## 4. Backend & API

There is **no custom backend server** (no Node/Express, no Next.js API routes). The “backend” is:

1. **Development:** Browser **localStorage** (mock).
2. **Production:** **Microsoft SharePoint** REST API, with the app assumed to run in a SharePoint context (e.g. hosted on the same site) so that `/_api/...` and credentials work.

### 4.1 “Server” Architecture

- **Mock:** In-memory persistence via `localStorage` keys from `sharepoint.config.js`.
- **Production:** SharePoint site; data stored as **.txt files** (JSON content) in a document library (default: `SiteAssets`). No separate app server; the React app is the only application layer and talks to SharePoint from the browser.

### 4.2 Data Storage (Schemas / Models)

**Logical “schemas”** are plain JSON:

**Events**

- Stored as one JSON object: `{ displayCount: number, events: Event[] }`.
- `Event`: `{ id, date (YYYY-MM-DD), title, subtitle, color ('gray'|'red') }`.
- Legacy migration in EventsService: `day`/`month` → `date` when missing.

**Navigation**

- Array of categories. Each category: `{ id, label, icon (Lucide name), url, children: Card[] }`.
- Card: `{ id, title, icon, url, subLinks: Link[] }`.
- Link: `{ id?, label, icon, url }`.

**Users (admin list)**

- Array: `{ id, name, role }[]`. Only `name` is used for admin check.

### 4.3 API Endpoints (SharePoint REST)

All endpoints are relative to the SharePoint site (e.g. `https://tenant.sharepoint.com/sites/bihs7134`). The app uses `credentials: 'include'` and same-origin or SharePoint-hosted deployment so cookies/auth apply.

| Method | Endpoint (pattern) | Purpose |
|--------|--------------------|--------|
| GET | `/_api/web/currentuser` | Get current user (Title/LoginName) for auto sign-in. |
| POST | `/_api/contextinfo` | Get Form Digest for write operations; cached ~25 min in `sharepointUtils`. |
| GET | `/_api/web/GetFileByServerRelativeUrl('...')/$value` | Read file content (events, nav, users). |
| POST | `/_api/web/GetFileByServerRelativeUrl('...')/$value` with `X-HTTP-Method: PUT` | Create/overwrite file (events, nav, users). |
| POST | `/_api/web/folders` | Create folder (e.g. Backups, backup-{timestamp}) for backup. |

**File paths** (from config, overridable by env):

- Events: `VITE_SP_EVENTS_FILE_URL` or `/sites/bihs7134/SiteAssets/events_data.txt`
- Navigation: `VITE_SP_NAV_FILE_URL` or `/sites/bihs7134/SiteAssets/nav_data.txt`
- Users: `VITE_SP_USERS_FILE_URL` or `/sites/bihs7134/SiteAssets/users_data.txt`

### 4.4 Data Flow (High Level)

1. **App load:** AuthProvider fetches users, then checks sessionStorage and optionally SharePoint current user. NavigationProvider and EventsProvider fetch navigation and events (from localStorage or SharePoint).
2. **Home:** Reads `navItems` and `currentUser` from context; EventsList reads `events` and `displayCount`; no direct service calls from Home for read.
3. **Admin:** AdminEvents/AdminNavigation keep local state, then call `saveEvents`/`saveNavigation`; context calls the corresponding service, which writes to localStorage or SharePoint and then updates context state.
4. **Backup:** AdminHub calls `createBackup()` in `sharepointUtils`, which creates a timestamped folder under SiteAssets/Backups and copies events and nav files (and optionally users); only runs when not in mock.

---

## 5. Core Functionality & Business Logic

### 5.1 Main Features

1. **Home page**
   - Rotating hero backgrounds (6 images, 3s interval).
   - Navbar: logo, category links (scroll or external URL), search (UI only), “ניהול”, greeting + user name.
   - Hero: unit logo, title “צוות אלפא 7134”, short description.
   - “דבר המפקד”: commander image, fixed quote, pagination buttons (visual only).
   - “מופעי החודש”: EventsList with auto-rotation and Hebrew dates.
   - Sections per navigation category (with children and no direct URL): section title + icon, grid of FlipCards (each card: icon, title, optional URL or subLinks on flip).

2. **Navigation behavior**
   - Category with `url`: navbar click opens URL in new tab.
   - Category without `url`: navbar click scrolls to `#cat.id`.
   - FlipCard with `url`: click opens URL in new tab.
   - FlipCard without `url`: click flips card to show subLinks; subLinks with `url` open in new tab.

3. **Events**
   - Sorted by date; `displayCount` (2–5) controls how many show; optional 6s rotation.
   - Status/color: gray (general) or red (urgent); EventsList and AdminEvents reflect this.

4. **Admin — Events**
   - Set “כמות להצגה” (2–5), “עדכן תצוגה” to persist.
   - Add/edit/delete events; modal with date, title, subtitle, color; save via EventsContext.

5. **Admin — Navigation**
   - Tree: root → categories → cards → links. Add at each level; edit name, icon, URL in properties panel and table; delete with confirmation; “שמור שינויים” calls `saveNavigation`.

6. **Admin — Backup**
   - Button “גיבוי מערכת ידני”; only when not mock; creates timestamped folder and copies events + nav (and optionally users) files.

### 5.2 User Flows

- **Visitor:** Opens `/` → sees home, can use nav links and flip cards; “ניהול” goes to `/admin` (no guard).
- **Admin (conceptual):** Same; in admin can change events and navigation and run backup (when not mock).
- **Auth:** If `sessionStorage['tracker_user_name']` exists, that user is shown and admin is determined by UsersService list (or mock = all admins). If not, production can try `/_api/web/currentuser` and sign in with that name.

### 5.3 Business Logic in Services

- **EventsService:** Normalizes payload (array → `{ displayCount, events }`), migrates old `day`/`month` to `date`, then get/save to localStorage or SharePoint; production save uses Form Digest and verifies by re-reading file.
- **NavigationService:** Get/save navigation JSON; mock seeds default category tree if empty.
- **UsersService:** Get/save users; production 404 creates default admin list and attempts to save it.
- **sharepointUtils:** `getRequestDigest()` with 25-minute cache; `createBackup(filesToBackup)` builds backup folder path, creates folders, reads each file and writes into backup folder.

---

## 6. Integrations & Third-Party Services

### 6.1 Microsoft SharePoint

- **Role:** Data persistence and (optionally) current user in production.
- **Usage:** REST API for reading/writing JSON files and creating backup folders; no SharePoint SDK in the repo.
- **Auth:** Implicit: app runs in SharePoint context with `credentials: 'include'`; no explicit OAuth or Azure AD code in the frontend (handled by SharePoint hosting).

### 6.2 Google Fonts

- **Heebo** loaded in `index.css` for Hebrew UI.

### 6.3 No Other Integrations

- **No** Auth0, Firebase, NextAuth, or other auth providers (only sessionStorage + SharePoint current user).
- **No** payment gateways.
- **No** other external APIs or cloud backends beyond SharePoint and Google Fonts.

---

## 7. Setup & Installation

### 7.1 Prerequisites

- **Node.js** (LTS, e.g. 18+)
- **npm** (or yarn/pnpm)

### 7.2 Install Dependencies

From the project root:

```bash
npm install
```

### 7.3 Environment Variables

Optional; all have defaults in `src/config/sharepoint.config.js`:

| Variable | Purpose | Default / behavior |
|----------|----------|---------------------|
| `VITE_USE_MOCK` | Force mock mode (localStorage) even in production build | `'true'` to force mock |
| `VITE_SP_EVENTS_FILE_URL` | SharePoint server-relative path for events JSON | `/sites/bihs7134/SiteAssets/events_data.txt` |
| `VITE_SP_NAV_FILE_URL` | SharePoint path for navigation JSON | `/sites/bihs7134/SiteAssets/nav_data.txt` |
| `VITE_SP_USERS_FILE_URL` | SharePoint path for users JSON | `/sites/bihs7134/SiteAssets/users_data.txt` |

Create a `.env` or `.env.local` in the project root if you need to override (e.g. for a different site or paths). Example:

```env
VITE_USE_MOCK=true
# VITE_SP_EVENTS_FILE_URL=/sites/YourSite/SiteAssets/events_data.txt
# VITE_SP_NAV_FILE_URL=/sites/YourSite/SiteAssets/nav_data.txt
# VITE_SP_USERS_FILE_URL=/sites/YourSite/SiteAssets/users_data.txt
```

**Mock mode** is automatically enabled when `import.meta.env.MODE === 'development'` or `VITE_USE_MOCK === 'true'`.

### 7.4 Run Locally (Development)

```bash
npm run dev
```

- Vite dev server starts (default http://localhost:5173).
- Mock mode is on: data is in localStorage; no SharePoint needed.
- Hot reload is enabled.

### 7.5 Build for Production

```bash
npm run build
```

- Output in `dist/`.
- By default mock is off; configure SharePoint file URLs if your deployment is not under `/sites/bihs7134/SiteAssets/`.

### 7.6 Preview Production Build

```bash
npm run preview
```

- Serves `dist/` locally to test the production build.

### 7.7 Lint

```bash
npm run lint
```

### 7.8 Running Against SharePoint (Production-like)

1. Deploy the built app to the same SharePoint site (e.g. host the SPA from a library or app part so that `/_api` is same-origin).
2. Ensure the three JSON files exist (or let UsersService create default users on first 404).
3. Do **not** set `VITE_USE_MOCK=true` for production build (or omit it).
4. Set `VITE_SP_*` if your paths differ from the defaults.

---

## Summary Table

| Topic | Detail |
|-------|--------|
| **App type** | React SPA (Vite), Hebrew RTL |
| **Backend** | None (mock: localStorage; production: SharePoint REST) |
| **Database** | None (JSON files in SharePoint or localStorage) |
| **State** | React Context (Auth, Navigation, Events) |
| **Routing** | React Router: `/`, `/admin`, `/admin/navigation` |
| **Auth** | sessionStorage + optional SharePoint current user; admin list from UsersService |
| **Integrations** | SharePoint (data + optional user), Google Fonts (Heebo) |

This document reflects the codebase as of the stated date. For Hebrew-oriented operational details, see `מסמך-תיעוד-מערכת.md`.
