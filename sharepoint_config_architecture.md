# SharePoint Config Architecture Audit

## Executive Verdict

The current architecture does **not** satisfy the production constraint of "one static build + one SharePoint-hosted config file".

Today the app has:

- 7 separate persisted data domains
- 7 SharePoint `.txt` files across configuration and access control
- 7 mock `localStorage` keys
- 3 additional browser-only `localStorage` keys in `ThemeContext`
- 1 `sessionStorage` key for the signed-in user
- no top-level schema version
- no canonical runtime config object
- no atomic save boundary
- no uniform validation layer

This means the app can currently drift into inconsistent state, silently drop values, and overwrite data in a way that will become much more dangerous once multiple unit deployments depend on long-lived config files.

The most serious findings are:

1. **Config is fragmented across multiple files and browser-only keys**, so there is no canonical state tree to serialize.
2. **`alerts` widget data is not normalized back into runtime state after reload**, so it is effectively not durable.
3. **`borderTargets` is only stored in browser `localStorage`**, not in SharePoint, so a unit's visual configuration is not portable.
4. **Most admin screens debounce saves but do not flush on unmount**, so navigating away within ~1.2s can lose edits.
5. **There is no schema-versioned deep merge strategy**, so future additions are handled ad hoc instead of by contract.

---

## 1. Current State And Critical Flaws Assessment

### 1.1 Current persistence surface

| Domain | Runtime owner | Current storage | Current key/file | Current shape summary |
| --- | --- | --- | --- | --- |
| Events | `EventsContext` + `EventsService` | SharePoint or `localStorage` | `events_data.txt` / `bihs_events_data` | `displayCount`, `displayMode`, `events[]` |
| Navigation | `NavigationContext` + `NavigationService` | SharePoint or `localStorage` | `nav_data.txt` / `bihs_nav_data` | top-level categories, children, subLinks |
| Site content | `SiteContentContext` + `SiteContentService` | SharePoint or `localStorage` | `site_content_data.txt` / `bihs_site_content_data` | hero, commander, overlay image |
| Theme | `ThemeContext` + `ThemeService` | SharePoint or `localStorage` | `theme_data.txt` / `bihs_theme_data` | color, display, layout, external links visuals |
| Widgets | `WidgetContext` + `WidgetService` | SharePoint or `localStorage` | `widgets_data.txt` / `bihs_widgets_data` | active widgets, rotation, widget data, widget display settings |
| External links | `ExternalLinksContext` + `ExternalLinksService` | SharePoint or `localStorage` | `external_links_data.txt` / `bihs_external_links_data` | footer links, icons/images |
| Admin users | `AuthContext` + `UsersService` | SharePoint or `localStorage` | `users_data.txt` / `bihs_users_data` | admin user list |
| User site display mode | `ThemeContext` | browser only | `bihs_user_display_mode` | `dark` or `light` |
| Admin panel display mode | `ThemeContext` | browser only | `bihs_admin_display_mode` | `dark` or `light` |
| Border target toggles | `ThemeContext` | browser only | `bihs_border_targets` | boolean flags per UI region |
| Signed-in user | `AuthContext` | browser only | `sessionStorage["tracker_user_name"]` | user name |

### 1.2 Exact data inventory by domain

#### A. Events

Current persisted payload:

```ts
{
  displayCount: number; // currently 2..8 in UI, default 3
  displayMode: "default" | "monthly" | "calendar";
  events: Array<{
    id: string;
    date: string;      // ISO date
    title: string;
    subtitle: string;
    color: "gray" | "red";
    // legacy migration also reads old day/month fields
  }>;
}
```

Notes:

- `EventsService` still migrates legacy `{ day, month }` into `date`.
- `EventsContext` polls every 60s.
- `EventsList` relies on both `displayCount` and `displayMode`.

#### B. Navigation

Current persisted shape is inconsistent by level:

```ts
Array<{
  id: string;
  label: string;
  icon: string;
  url: string;
  children: Array<{
    id: string;
    title: string;     // second level uses title
    label?: string;    // sometimes mirrored
    icon: string;
    url: string;
    subLinks: Array<{
      id?: string;
      label: string;   // third level uses label
      icon: string;
      url: string;
    }>;
  }>;
}>;
```

Notes:

- Field naming is inconsistent: `label`, `title`, `subLinks`, `children`.
- Some code treats `url` as a direct-link flag at any level.
- There is no schema normalization step in `NavigationService`.

#### C. Site content

Current persisted payload:

```ts
{
  hero: {
    siteName: string;
    title: string;               // multiline string
    subtitle: string;
    logo: string;                // URL or data URL
    description: string;         // multiline string
    backgroundImages: string[];  // URLs or data URLs
  };
  commander: {
    image: string;               // URL or data URL
    sectionTitle: string;
    roleLabel: string;
    decorativeElement: "line-diamond-line" | "dots" | "line" | "double-line";
    messages: Array<{
      id: string;
      text: string;
      signature: string;
    }>;
  };
  overlayImage: {
    enabled: boolean;
    imageUrl: string;
    width: number;
    height: number;
    opacity: number;             // 0..100
    objectFit: "contain" | "cover";
    borderStyle: "none" | "standard" | "square" | "cyber" | "armor" | "shield" | "blade";
    positionMode: "fixed" | "absolute";
    displayArea: "site" | "hero";
    anchor:
      | "top-left" | "top-center" | "top-right"
      | "middle-left" | "middle-center" | "middle-right"
      | "bottom-left" | "bottom-center" | "bottom-right";
    offsetX: number;
    offsetY: number;
    zIndex: number;
  };
}
```

Notes:

- Admin UI constrains `hero.title` to 2 lines and `hero.description` to 3 lines, but persisted data has no hard validator.
- Uploaded images are stored as URLs in production and as data URLs in mock mode.

#### D. Theme and layout

Current persisted payload:

```ts
{
  primaryColor: string; // hex
  useTintedBackground: boolean;
  tintedBackgroundStrength: number; // 0..100
  displayMode: "dark" | "light" | "user-toggle";
  borderStyle: "standard" | "square" | "cyber" | "armor" | "shield" | "blade";
  linksLayout: string; // legacy/orphaned
  showNavCategories: boolean;
  heroGrayscale: boolean;
  regularLinksLayout: "sidebar-right" | "grid" | "compact" | "hq";
  externalLinksLayout: "cards" | "minimal" | "floating";
  externalLinksFixed: boolean;
  externalLinksBordered: boolean;
  externalLinksShowBackground: boolean;
  widgetHeight: "full" | "high" | "medium" | "low";
}
```

Browser-only visual state, currently **not** SharePoint-backed:

```ts
{
  userDisplayMode: "dark" | "light"; // bihs_user_display_mode
  adminDisplayMode: "dark" | "light"; // bihs_admin_display_mode
  borderTargets: {
    commander: boolean;
    widget: boolean;
    search: boolean;
    topNav: boolean;
    sideNav: boolean;
    flipCards: boolean;
    extLinks: boolean;
    hqDash: boolean;
  };
}
```

Notes:

- `borderTargets` is used by the real app, including right sidebar nav and external links, but it never goes to SharePoint.
- `linksLayout` is legacy/orphaned and should not survive into the new schema.
- `ThemeService` already contains legacy compatibility branches for `colorPackage` and the typo `externalLinksBordeprimary`, which is strong evidence that schema drift has already started.

#### E. Widgets

Current persisted payload is intended to include:

```ts
{
  activeWidgets: WidgetId[];        // max 3
  activeWidget?: WidgetId;          // legacy alias
  rotationInterval: number;         // seconds, 3..30
  widgetSettings: {
    outstanding?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    news?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    phonebook?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    shuttles?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    polls?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    celebrations?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    heritage?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    tips?: { itemsPerView: number; autoScroll: boolean; intervalMs: number };
    // alerts is missing from current defaults and support table
  };
  outstanding: Array<{ id: string; name: string; role: string; image: string; description: string }>;
  countdown: { title: string; targetDate: string };
  news: Array<{ id: string; text: string; isUrgent: boolean }>;
  phonebook: Array<{ id: string; name: string; number: string; department: string }>;
  shuttles: Array<{ id: string; destination: string; departureTime: string; type: "bus" | "minibus" }>;
  polls: Array<{
    id: string;
    question: string;
    options: Array<{ id: string; text: string; votes: number }>;
    active: boolean;
  }>;
  celebrations: Array<{ id: string; name: string; type: string; date: string; description: string }>;
  heritage: Array<{ id: string; quote: string; author: string; role: string }>;
  tips: Array<{ id: string; title: string; text: string }>;
  alerts?: Array<{ id: string; title: string; text: string; isUrgent: boolean }>;
}
```

Important runtime consumers:

- `EventsList` also acts as the `events` widget, but its data currently lives in the separate events domain.
- `WidgetPanelContent` expects `alerts`, even though `WidgetService` does not normalize or default it.

#### F. External links

Current persisted payload:

```ts
Array<{
  id: string;
  title: string;
  url: string;
  icon?: string;     // Lucide icon name
  iconUrl?: string;  // uploaded image URL
  image?: string;    // legacy alias of iconUrl
  order?: number;    // normalized, but not actually managed in the admin UI
}>;
```

Notes:

- The admin form derives a transient `visualType` (`icon` vs `image`) but does not persist it.
- The save path drops the legacy `image` alias and does not preserve `order` on edit.

#### G. Users / access control

Current persisted payload:

```ts
Array<{
  id: number;
  name: string;
  role: string; // currently "admin"
}>;
```

Notes:

- There is no current admin UI for this file.
- It is still part of the persisted application state and should either be absorbed into the master config or explicitly declared out of scope.

### 1.3 Admin UI state that is currently not persisted correctly

These are the important cases where admin-visible configuration is not actually durable in the way production requires:

1. **`borderTargets`**
   - Visible and editable in `AdminTheme`.
   - Persisted only to browser `localStorage`.
   - Not included in `ThemeService`.
   - Not shared across users, browsers, or SharePoint environments.

2. **`alerts` widget data**
   - Editable in `AdminAlerts`.
   - Saved through `saveWidgetConfig({ ...widgetConfig, alerts: list })`.
   - Dropped by `WidgetService._normalizeData()` on the next fetch/reload because `alerts` is missing from the normalized return object.

3. **`alerts` widget display settings**
   - `AdminAlerts` renders `WidgetDisplaySettingsPanel`.
   - `WidgetDisplaySettingsPanel` only supports widget keys present in `DEFAULT_WIDGET_SETTINGS`.
   - `alerts` is missing there, so no display settings panel is actually shown or persisted.

4. **Pending debounced edits across most admin screens**
   - `AdminSiteContent`, `AdminNavigation`, `AdminEvents`, `AdminExternalLinks`, and the widget admin screens debounce saves by ~1200ms.
   - Unlike `AdminTheme`, they do not flush pending changes on unmount.
   - Navigating away quickly can lose the last edit.

5. **Uploaded image references can be orphaned**
   - In site content and external links, image upload completes immediately.
   - The URL is then persisted only by a later debounced config save.
   - If the user leaves before the debounce fires, the binary asset remains in SharePoint but the config never points to it.

### 1.4 Critical flaws and vulnerabilities

#### Critical

1. **No canonical state tree**
   - The app has multiple independent persistence services with no atomic boundary.
   - A "save all configuration" operation does not exist today.

2. **No schema version contract**
   - There is no top-level `schemaVersion`.
   - Migration is currently ad hoc and service-specific.

3. **`alerts` widget is functionally broken across reloads**
   - Admin can edit it.
   - Runtime can render it.
   - The service layer does not round-trip it.

4. **SharePoint config is incomplete because `borderTargets` never leaves the browser**
   - This directly violates the deployment goal of a unit-portable config file.

5. **Current saves are last-write-wins and not atomic**
   - Every service writes its own file with `IF-MATCH: "*"`.
   - There is no ETag conflict handling.
   - There is no multi-domain transaction.

6. **Admin authorization is not a real security boundary**
   - `AuthContext` accepts a manually entered user name and stores it in `sessionStorage`.
   - Admin access is granted by checking whether that plain text name exists in the downloaded admin-user list.
   - In a static client-only app, this is convenience gating, not secure authorization.
   - If admin capability is security-sensitive, it must be enforced by SharePoint identity and file permissions, not by client-side state.

#### High

7. **Production bootstrap can briefly hydrate widgets from stale local browser data**
   - `WidgetContext` reads `localStorage` directly during initial state creation regardless of `useMock`.
   - A production browser with stale mock data can render the wrong active widgets until SharePoint fetch completes.

8. **Most admin pages can lose last-second edits**
   - Debounced saves are canceled on unmount without a final flush.

9. **Events polling can overwrite in-progress admin state**
   - `EventsContext` refreshes every 60s.
   - `AdminEvents` resets local state from context whenever the provider updates.
   - This can clobber local unsaved edits or open-edit context.

10. **No deep validation layer**
   - Services mostly do shallow fallbacking, not full structural validation.
   - Nested arrays and nested objects are trusted too easily.
   - Invalid shapes degrade inconsistently.

11. **Mock mode quota failures are handled inconsistently**
    - Site content can store multiple data-URL images.
    - External links shows a quota-specific error.
    - Other domains mostly fail generically.

#### Medium

12. **Schema drift is already visible**
    - `ThemeService` still understands `colorPackage`.
    - `ThemeService` still checks typo key `externalLinksBordeprimary`.
    - `ThemeService` still returns `linksLayout`, which the current UI/runtime does not use.

13. **Navigation schema is structurally inconsistent**
    - Level 1 uses `label`, level 2 uses `title`, level 3 uses `label`.
    - Level 2 children are `subLinks`, not `children`.
    - This complicates migrations, recursive tooling, and future widgets.

14. **Poll schema allows multiple active polls**
    - `AdminPolls` allows any poll to be marked `active: true`.
    - `WidgetPolls` renders only `data.find((item) => item.active === true)`.
    - Multiple active polls produce ambiguous, order-dependent behavior.

15. **Service "verification" is weak**
    - Save verification only checks that a GET succeeds.
    - It does not compare payload hashes, parsed content, or schema validity.

16. **Several normalizers mutate input objects**
    - `SiteContentService._normalizeData` mutates `hero` and `commander`.
    - `EventsService._normalizeData` mutates `data`.
    - This is survivable, but it is sloppy for a versioned config system.

---

## 2. The Master JSON Schema (`v1.0.0`)

### 2.1 Design principles

The new master config should follow these rules:

1. One SharePoint file is the canonical source of truth for unit configuration.
2. Every persisted setting used by the UI must exist somewhere under that root object.
3. Browser/session-only preferences must be explicitly excluded from the master schema.
4. Field names must be normalized and consistent.
5. Defaulting and migration must be driven by one schema, not by individual services.
6. New widgets must be additive: old configs load safely without manual edits.

### 2.2 Canonical root structure

```json
{
  "schemaVersion": "1.0.0",
  "meta": {},
  "theme": {},
  "layout": {},
  "navigation": {},
  "content": {},
  "widgets": {},
  "externalLinks": {},
  "access": {}
}
```

### 2.3 Exact TypeScript contract

This should be the canonical contract for the unified SharePoint file. The runtime validator can be generated from this shape, but the source of truth should be one versioned interface, not several ad hoc service defaults.

```ts
export type SchemaVersion = '1.0.0';

export type ThemeDisplayMode = 'dark' | 'light' | 'user-toggle';
export type BorderStyle = 'standard' | 'square' | 'cyber' | 'armor' | 'shield' | 'blade';
export type WidgetHeight = 'full' | 'high' | 'medium' | 'low';
export type NavigationLayoutMode = 'sidebar-right' | 'grid' | 'compact' | 'hq';
export type ExternalLinksLayoutMode = 'cards' | 'minimal' | 'floating';
export type OverlayObjectFit = 'contain' | 'cover';
export type OverlayPositionMode = 'fixed' | 'absolute';
export type OverlayDisplayArea = 'site' | 'hero';
export type OverlayAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type DecorativeElement = 'line-diamond-line' | 'dots' | 'line' | 'double-line';
export type EventDisplayMode = 'default' | 'monthly' | 'calendar';
export type EventColor = 'gray' | 'red';
export type ShuttleType = 'bus' | 'minibus';
export type WidgetId =
  | 'events'
  | 'alerts'
  | 'outstanding'
  | 'countdown'
  | 'news'
  | 'phonebook'
  | 'shuttles'
  | 'polls'
  | 'celebrations'
  | 'heritage'
  | 'tips';
export type DisplayConfigurableWidgetId =
  | 'alerts'
  | 'outstanding'
  | 'news'
  | 'phonebook'
  | 'shuttles'
  | 'polls'
  | 'celebrations'
  | 'heritage'
  | 'tips';

export interface SharePointAppConfigV1 {
  schemaVersion: '1.0.0';
  meta: ConfigMeta;
  theme: ThemeConfig;
  layout: LayoutConfig;
  navigation: NavigationConfig;
  content: ContentConfig;
  widgets: WidgetsConfig;
  externalLinks: ExternalLinksConfig;
  access: AccessConfig;
}

export interface ConfigMeta {
  appId: 'bihs-7134';
  migratedFromLegacy: boolean;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

export interface ThemeConfig {
  primaryColor: string;
  displayMode: ThemeDisplayMode;
  borderStyle: BorderStyle;
  borderTargets: BorderTargets;
  backgrounds: {
    tinted: {
      enabled: boolean;
      strength: number;
    };
    hero: {
      grayscale: boolean;
    };
  };
}

export interface BorderTargets {
  commander: boolean;
  widget: boolean;
  search: boolean;
  topNav: boolean;
  sideNav: boolean;
  flipCards: boolean;
  extLinks: boolean;
  hqDash: boolean;
}

export interface LayoutConfig {
  navigation: {
    showCategories: boolean;
    mode: NavigationLayoutMode;
  };
  hero: {
    widgetHeight: WidgetHeight;
  };
  externalLinks: {
    mode: ExternalLinksLayoutMode;
    fixed: boolean;
    bordered: boolean;
    showBackground: boolean;
  };
}

export interface NavigationConfig {
  items: NavigationNode[];
}

export interface NavigationNode {
  id: string;
  label: string;
  icon: string;
  url: string;
  children: NavigationNode[];
}

export interface ContentConfig {
  hero: HeroContent;
  commander: CommanderContent;
  overlayImage: OverlayImageConfig;
}

export interface HeroContent {
  siteName: string;
  title: string;
  subtitle: string;
  logoUrl: string;
  description: string;
  backgroundImageUrls: string[];
}

export interface CommanderContent {
  imageUrl: string;
  sectionTitle: string;
  roleLabel: string;
  decorativeElement: DecorativeElement;
  messages: CommanderMessage[];
}

export interface CommanderMessage {
  id: string;
  text: string;
  signature: string;
}

export interface OverlayImageConfig {
  enabled: boolean;
  imageUrl: string;
  width: number;
  height: number;
  opacity: number;
  objectFit: OverlayObjectFit;
  borderStyle: 'none' | BorderStyle;
  positionMode: OverlayPositionMode;
  displayArea: OverlayDisplayArea;
  anchor: OverlayAnchor;
  offsetX: number;
  offsetY: number;
  zIndex: number;
}

export interface WidgetsConfig {
  active: WidgetId[];
  carousel: {
    rotationIntervalSeconds: number;
  };
  display: Partial<Record<DisplayConfigurableWidgetId, WidgetDisplaySettings>>;
  data: WidgetsDataConfig;
}

export interface WidgetDisplaySettings {
  itemsPerView: number;
  autoScroll: boolean;
  intervalMs: number;
}

export interface WidgetsDataConfig {
  events: EventsWidgetConfig;
  alerts: AlertsWidgetConfig;
  outstanding: OutstandingWidgetConfig;
  countdown: CountdownWidgetConfig;
  news: NewsWidgetConfig;
  phonebook: PhonebookWidgetConfig;
  shuttles: ShuttlesWidgetConfig;
  polls: PollsWidgetConfig;
  celebrations: CelebrationsWidgetConfig;
  heritage: HeritageWidgetConfig;
  tips: TipsWidgetConfig;
}

export interface EventsWidgetConfig {
  displayCount: number;
  displayMode: EventDisplayMode;
  items: EventItem[];
}

export interface EventItem {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  color: EventColor;
}

export interface AlertsWidgetConfig {
  items: AlertItem[];
}

export interface AlertItem {
  id: string;
  title: string;
  text: string;
  isUrgent: boolean;
}

export interface OutstandingWidgetConfig {
  items: OutstandingItem[];
}

export interface OutstandingItem {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
  description: string;
}

export interface CountdownWidgetConfig {
  title: string;
  targetDate: string;
}

export interface NewsWidgetConfig {
  items: NewsItem[];
}

export interface NewsItem {
  id: string;
  text: string;
  isUrgent: boolean;
}

export interface PhonebookWidgetConfig {
  items: PhonebookItem[];
}

export interface PhonebookItem {
  id: string;
  name: string;
  number: string;
  department: string;
}

export interface ShuttlesWidgetConfig {
  items: ShuttleItem[];
}

export interface ShuttleItem {
  id: string;
  destination: string;
  departureTime: string;
  type: ShuttleType;
}

export interface PollsWidgetConfig {
  activePollId: string | null;
  items: PollItem[];
}

export interface PollItem {
  id: string;
  question: string;
  options: PollOption[];
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface CelebrationsWidgetConfig {
  items: CelebrationItem[];
}

export interface CelebrationItem {
  id: string;
  name: string;
  type: string;
  date: string;
  description: string;
}

export interface HeritageWidgetConfig {
  items: HeritageItem[];
}

export interface HeritageItem {
  id: string;
  quote: string;
  author: string;
  role: string;
}

export interface TipsWidgetConfig {
  items: TipItem[];
}

export interface TipItem {
  id: string;
  title: string;
  text: string;
}

export interface ExternalLinksConfig {
  items: ExternalLinkItem[];
}

export interface ExternalLinkItem {
  id: string;
  title: string;
  url: string;
  visual: ExternalLinkVisual;
  order: number;
}

export type ExternalLinkVisual =
  | { type: 'none' }
  | { type: 'icon'; icon: string }
  | { type: 'image'; imageUrl: string };

export interface AccessConfig {
  adminUsers: AdminUser[];
}

export interface AdminUser {
  id: string;
  name: string;
  role: string;
}
```

### 2.4 Root validation rules

The schema above should be enforced with these runtime rules:

| Path | Rule |
| --- | --- |
| `schemaVersion` | required exact string `1.0.0` |
| `theme.primaryColor` | valid hex color |
| `theme.displayMode` | enum `dark | light | user-toggle` |
| `theme.backgrounds.tinted.strength` | clamp to `0..100` |
| `layout.hero.widgetHeight` | enum `full | high | medium | low` |
| `widgets.active` | unique allowed widget ids, max length `3`, fallback `['events']` |
| `widgets.carousel.rotationIntervalSeconds` | integer clamp `3..30` |
| `widgets.display.*.itemsPerView` | integer min `1` |
| `widgets.display.*.intervalMs` | integer min `1000` |
| `widgets.data.events.displayCount` | integer clamp `1..12` |
| `widgets.data.events.items[*].date` | ISO date string |
| `widgets.data.polls.activePollId` | `null` or an id that exists in `widgets.data.polls.items` |
| `navigation.items` | recursive array of normalized `NavigationNode` |
| `externalLinks.items[*].visual` | exactly one valid visual variant |
| `content.overlayImage.opacity` | clamp `0..100` |
| `access.adminUsers[*]` | normalize to stable string ids and non-empty names |

### 2.5 Explicit field mapping from current state to `v1.0.0`

| Current field | Current source | New path |
| --- | --- | --- |
| `primaryColor` | theme file | `theme.primaryColor` |
| `displayMode` | theme file | `theme.displayMode` |
| `useTintedBackground` | theme file | `theme.backgrounds.tinted.enabled` |
| `tintedBackgroundStrength` | theme file | `theme.backgrounds.tinted.strength` |
| `borderStyle` | theme file | `theme.borderStyle` |
| `heroGrayscale` | theme file | `theme.backgrounds.hero.grayscale` |
| `borderTargets.*` | browser `localStorage` | `theme.borderTargets.*` |
| `showNavCategories` | theme file | `layout.navigation.showCategories` |
| `regularLinksLayout` | theme file | `layout.navigation.mode` |
| `externalLinksLayout` | theme file | `layout.externalLinks.mode` |
| `externalLinksFixed` | theme file | `layout.externalLinks.fixed` |
| `externalLinksBordered` | theme file | `layout.externalLinks.bordered` |
| `externalLinksShowBackground` | theme file | `layout.externalLinks.showBackground` |
| `widgetHeight` | theme file | `layout.hero.widgetHeight` |
| `linksLayout` | theme file | removed as dead legacy field |
| navigation root array | navigation file | `navigation.items` |
| `hero.siteName` | site content file | `content.hero.siteName` |
| `hero.title` | site content file | `content.hero.title` |
| `hero.subtitle` | site content file | `content.hero.subtitle` |
| `hero.logo` | site content file | `content.hero.logoUrl` |
| `hero.description` | site content file | `content.hero.description` |
| `hero.backgroundImages` | site content file | `content.hero.backgroundImageUrls` |
| `commander.image` | site content file | `content.commander.imageUrl` |
| `commander.sectionTitle` | site content file | `content.commander.sectionTitle` |
| `commander.roleLabel` | site content file | `content.commander.roleLabel` |
| `commander.decorativeElement` | site content file | `content.commander.decorativeElement` |
| `commander.messages` | site content file | `content.commander.messages` |
| `overlayImage.*` | site content file | `content.overlayImage.*` |
| `activeWidgets` | widgets file | `widgets.active` |
| `activeWidget` | widgets file | migrated into `widgets.active` |
| `rotationInterval` | widgets file | `widgets.carousel.rotationIntervalSeconds` |
| `widgetSettings.*` | widgets file | `widgets.display.*` |
| `displayCount` | events file | `widgets.data.events.displayCount` |
| `displayMode` | events file | `widgets.data.events.displayMode` |
| `events[]` | events file | `widgets.data.events.items[]` |
| `alerts[]` | widgets file | `widgets.data.alerts.items[]` |
| `outstanding[]` | widgets file | `widgets.data.outstanding.items[]` |
| `countdown` | widgets file | `widgets.data.countdown` |
| `news[]` | widgets file | `widgets.data.news.items[]` |
| `phonebook[]` | widgets file | `widgets.data.phonebook.items[]` |
| `shuttles[]` | widgets file | `widgets.data.shuttles.items[]` |
| `polls[]` | widgets file | `widgets.data.polls.items[]` plus `activePollId` |
| `celebrations[]` | widgets file | `widgets.data.celebrations.items[]` |
| `heritage[]` | widgets file | `widgets.data.heritage.items[]` |
| `tips[]` | widgets file | `widgets.data.tips.items[]` |
| external links array | external links file | `externalLinks.items[]` |
| users array | users file | `access.adminUsers[]` |

### 2.6 State that must remain outside the shared config

These values are runtime/session concerns and should **not** be written into the unit-wide SharePoint config file:

| State | Why it stays out of `config.txt` |
| --- | --- |
| `sessionStorage["tracker_user_name"]` | session identity, not site configuration |
| `bihs_user_display_mode` | per-user preference for `user-toggle` mode |
| `bihs_admin_display_mode` | admin-console preference, not site content |
| open modal / selected tab / search input / edit-mode flags | transient UI state |
| widget-local interaction state such as poll vote selection or phonebook query text | per-session interaction, not configuration |

Important distinction:

- `theme.displayMode = 'user-toggle'` **is** shared config because it defines site behavior.
- The actual individual user's current chosen mode **is not** shared config.

### 2.7 Example serialized `config.txt`

```json
{
  "schemaVersion": "1.0.0",
  "meta": {
    "appId": "bihs-7134",
    "migratedFromLegacy": false,
    "lastUpdatedAt": "2026-03-17T12:00:00.000Z",
    "lastUpdatedBy": "Display Name"
  },
  "theme": {
    "primaryColor": "#3b82f6",
    "displayMode": "user-toggle",
    "borderStyle": "shield",
    "borderTargets": {
      "commander": true,
      "widget": true,
      "search": true,
      "topNav": true,
      "sideNav": true,
      "flipCards": true,
      "extLinks": true,
      "hqDash": true
    },
    "backgrounds": {
      "tinted": {
        "enabled": true,
        "strength": 55
      },
      "hero": {
        "grayscale": false
      }
    }
  },
  "layout": {
    "navigation": {
      "showCategories": true,
      "mode": "hq"
    },
    "hero": {
      "widgetHeight": "high"
    },
    "externalLinks": {
      "mode": "cards",
      "fixed": false,
      "bordered": true,
      "showBackground": true
    }
  },
  "navigation": {
    "items": []
  },
  "content": {
    "hero": {
      "siteName": "",
      "title": "",
      "subtitle": "",
      "logoUrl": "",
      "description": "",
      "backgroundImageUrls": []
    },
    "commander": {
      "imageUrl": "",
      "sectionTitle": "",
      "roleLabel": "",
      "decorativeElement": "line-diamond-line",
      "messages": []
    },
    "overlayImage": {
      "enabled": false,
      "imageUrl": "",
      "width": 320,
      "height": 320,
      "opacity": 100,
      "objectFit": "contain",
      "borderStyle": "none",
      "positionMode": "absolute",
      "displayArea": "site",
      "anchor": "bottom-right",
      "offsetX": 0,
      "offsetY": 0,
      "zIndex": 2
    }
  },
  "widgets": {
    "active": ["events"],
    "carousel": {
      "rotationIntervalSeconds": 8
    },
    "display": {},
    "data": {
      "events": {
        "displayCount": 3,
        "displayMode": "default",
        "items": []
      },
      "alerts": { "items": [] },
      "outstanding": { "items": [] },
      "countdown": {
        "title": "",
        "targetDate": ""
      },
      "news": { "items": [] },
      "phonebook": { "items": [] },
      "shuttles": { "items": [] },
      "polls": {
        "activePollId": null,
        "items": []
      },
      "celebrations": { "items": [] },
      "heritage": { "items": [] },
      "tips": { "items": [] }
    }
  },
  "externalLinks": {
    "items": []
  },
  "access": {
    "adminUsers": []
  }
}
```

---

## 3. The Migration And Hydration Strategy

### 3.1 Startup hydration contract

The app should hydrate through one path only:

1. `ConfigProvider` requests the raw JSON text from a single adapter.
2. If the file is missing, the provider loads `DEFAULT_CONFIG_V1`.
3. If the file exists, parse it inside a guarded `try/catch`.
4. If parsing fails, log the failure, surface an admin-visible error state, and continue with defaults instead of crashing the app shell.
5. Read `schemaVersion`.
6. If `schemaVersion === '1.0.0'`, validate and normalize directly.
7. If `schemaVersion` is missing or older, run ordered migrators until the object becomes `1.0.0`.
8. Deep-merge the migrated object into `DEFAULT_CONFIG_V1`.
9. Run a final normalization pass that clamps values, repairs enums, normalizes arrays, and synthesizes missing branches.
10. Expose the final object as the only runtime config source.

Non-negotiable rule:

- No component should read SharePoint files or config `localStorage` keys directly after this refactor.
- All runtime consumers must read from `ConfigProvider`.

### 3.2 Recommended load pipeline

```ts
rawText -> safeParseJson -> detectVersion -> migrateToV1 -> deepMerge(DEFAULT_CONFIG_V1, migrated)
       -> validateAndNormalize -> freezeCanonicalConfig -> renderApp
```

Each stage has a distinct purpose:

| Stage | Responsibility |
| --- | --- |
| `safeParseJson` | prevent crash on malformed file |
| `detectVersion` | choose the right migrator |
| `migrateToV1` | transform old field names and split legacy domains |
| `deepMerge` | inject new defaults without erasing valid saved values |
| `validateAndNormalize` | clamp invalid values and repair structural drift |
| `freezeCanonicalConfig` | ensure consumers read one normalized shape |

### 3.3 Deep-merge strategy

The merge contract must be explicit. A generic library call with default behavior is not enough.

#### Merge rules by value type

| Value type | Rule |
| --- | --- |
| missing object branch | create from defaults |
| known object branch | recurse by key |
| primitive with valid saved value | keep saved value |
| primitive with invalid saved value | replace with default |
| arrays of records | replace with saved array after per-item normalization |
| arrays of ids | keep saved order, dedupe, filter invalid ids, apply max length |
| unknown future keys | preserve in memory and re-emit on save |
| `null` where schema expects object/array | replace with default |

#### Why arrays must not be index-merged

Widget lists, navigation items, hero backgrounds, polls, and external links are authored collections. Index-merging them with defaults would create corrupt hybrids. The correct rule is:

- validate each saved item
- normalize each item independently
- keep the saved array if valid enough to recover
- otherwise fall back to the default array for that branch

#### Branch-specific merge rules

| Branch | Rule |
| --- | --- |
| `widgets.active` | dedupe, filter to allowed widget ids, max 3, fallback `['events']` |
| `widgets.display` | merge per widget key so new widget display defaults appear automatically |
| `widgets.data.polls.activePollId` | if id missing from items, set to first item id or `null` |
| `navigation.items` | recursively normalize every node to `{ id, label, icon, url, children }` |
| `externalLinks.items` | convert old `icon` / `iconUrl` / `image` fields into `visual` union |
| `theme.borderTargets` | merge per flag so newly added targets default safely |

### 3.4 Future-proofing example: new widget in `v1.2.0`

Assume `v1.2.0` adds a new `gallery` widget:

```ts
widgets: {
  data: {
    gallery: {
      items: []
    }
  }
}
```

An older unit still has this saved file:

```json
{
  "schemaVersion": "1.0.0",
  "widgets": {
    "active": ["events", "news"],
    "data": {
      "events": { "displayCount": 3, "displayMode": "default", "items": [] },
      "news": { "items": [] }
    }
  }
}
```

Correct hydration outcome:

1. Load saved config.
2. Detect older version.
3. Run migrators up to the current version.
4. Deep-merge with new defaults.
5. Result contains `widgets.data.gallery.items = []`.
6. The app does not crash because every consumer reads from normalized defaults, not directly from missing nested fields.

This is the core future-proofing guarantee:

- New branches appear automatically.
- Old branches retain their saved values.
- Unknown branches from future versions are preserved instead of being deleted by older clients.

### 3.5 Legacy migration strategy from the current split architecture

The first unified loader should support a one-time migration path:

1. Try loading the new unified `config.txt`.
2. If present and valid, use it and stop.
3. If not present, read the existing split legacy sources:
   - `theme_data.txt`
   - `site_content_data.txt`
   - `nav_data.txt`
   - `events_data.txt`
   - `widgets_data.txt`
   - `external_links_data.txt`
   - `users_data.txt`
4. Also read browser-only legacy `borderTargets` if available.
5. Assemble a full `SharePointAppConfigV1`.
6. Normalize and validate it.
7. Save it immediately to the new unified file.
8. Mark `meta.migratedFromLegacy = true`.
9. Stop reading legacy files after successful cutover.

Strong recommendation:

- Keep the legacy readers only for the migration window.
- Remove them completely after rollout confidence is established.
- Do not keep dual-write permanently. It will reintroduce drift.

### 3.6 Save strategy

Saving must also be centralized:

1. Receive a config patch or updater function.
2. Apply it to the current in-memory canonical config.
3. Run the same normalization and validation pipeline used at load time.
4. Serialize with stable key ordering.
5. Save exactly one file.
6. Store and compare the SharePoint ETag.
7. If the ETag changed, surface a conflict instead of blindly overwriting.
8. Refresh in-memory state only after successful persistence.

This directly replaces the current weak model of:

- several services
- several PUT requests
- `IF-MATCH: "*"`
- best-effort verification

### 3.7 Error handling and resilience requirements

The new loader/saver should explicitly handle these cases:

| Case | Required behavior |
| --- | --- |
| malformed JSON | use defaults, show error banner, keep app alive |
| missing file | use defaults, allow first save to create file |
| partial object | deep-merge with defaults |
| unsupported enum value | replace with default |
| unknown future keys | preserve and round-trip |
| stale ETag on save | reject overwrite, prompt refresh/retry |
| temporary SharePoint fetch failure | keep last good in-memory config and show non-blocking error |

### 3.8 Security boundary clarification

A unified config file can contain `access.adminUsers`, but that file is still client-readable state. Therefore:

- it is acceptable for feature gating and convenience
- it is **not** acceptable as the sole security mechanism for privileged actions

If real authorization matters, enforcement must come from:

- SharePoint identity
- SharePoint file permissions
- or a trusted backend/API layer

The current client-side admin-user list should be treated as UX sugar, not security.

---

## 4. Step-By-Step Refactor Roadmap

### Phase 1. Freeze the contract before touching runtime logic

1. Create one schema module that exports:
   - `DEFAULT_CONFIG_V1`
   - the `SharePointAppConfigV1` type
   - validators and normalizers
   - migration helpers
2. Decide the final unified file location and name.
3. Lock the field names in this document before refactoring any provider.

Failure mode to avoid:

- starting implementation while field names are still moving

### Phase 2. Build a single config adapter layer

Create one interface:

```ts
interface ConfigAdapter {
  load(): Promise<{ text: string | null; etag?: string | null }>;
  save(text: string, etag?: string | null): Promise<{ etag?: string | null }>;
}
```

Implement two adapters:

1. `SharePointConfigAdapter`
   - reads and writes one `.txt` file
   - returns ETag
   - stops using split file URLs
2. `LocalConfigAdapter`
   - reads and writes one mock `localStorage` key
   - mirrors the same shape as production

Important:

- image upload helpers can remain separate
- only image URLs belong in the config

### Phase 3. Implement the migration engine

1. Create `migrateLegacySplitStateToV1()`.
2. Read all old services only inside this migrator.
3. Convert old names into new paths.
4. Convert navigation into recursive normalized nodes.
5. Convert `polls[].active` booleans into `activePollId`.
6. Pull browser-only `borderTargets` into `theme.borderTargets`.
7. Pull events into `widgets.data.events`.
8. Pull users into `access.adminUsers`.
9. Add `alerts` to the normalized widget data model.

Exit criterion:

- any existing deployment can be upgraded into one valid `1.0.0` config object

### Phase 4. Introduce `ConfigService`

`ConfigService` should become the only persistence abstraction.

Required responsibilities:

1. `loadConfig()`
2. `saveConfig(nextConfig)`
3. `updateConfig(updater)`
4. `resetConfig()`
5. `exportConfigText()`
6. `importConfigText()`

Required guarantees:

1. always returns normalized `SharePointAppConfigV1`
2. never emits partially normalized state
3. preserves unknown future keys
4. handles ETag conflicts centrally

### Phase 5. Introduce `ConfigProvider`

`ConfigProvider` should own:

| State | Purpose |
| --- | --- |
| `config` | canonical normalized config |
| `loading` | initial hydration |
| `saving` | active save state |
| `error` | recoverable load/save problems |
| `dirty` | unsaved local changes |
| `etag` | conflict protection |

Provider API should include:

1. `config`
2. `updateConfig(pathOrUpdater)`
3. `saveNow()`
4. `reload()`
5. selector hooks such as `useThemeConfig()`, `useWidgetsConfig()`, `useNavigationConfig()`

### Phase 6. Convert existing contexts into thin compatibility wrappers

Do **not** rewrite every consumer at once. Bridge first.

1. `ThemeContext` becomes a selector over `ConfigProvider`.
2. `WidgetContext` becomes a selector over `config.widgets`.
3. `EventsContext` becomes a selector over `config.widgets.data.events`.
4. `SiteContentContext` becomes a selector over `config.content`.
5. `NavigationContext` becomes a selector over `config.navigation`.
6. `ExternalLinksContext` becomes a selector over `config.externalLinks`.
7. `AuthContext` reads `config.access.adminUsers` for UX-only gating.

This staged bridge minimizes breakage while removing direct service ownership.

### Phase 7. Refactor admin screens to edit config slices, not service payloads

Every admin screen should stop owning its own persistence timing logic.

Required changes:

1. Replace screen-specific service calls with `updateConfig`.
2. Centralize debounce in `ConfigProvider` or a shared save controller.
3. Always flush pending changes on unmount and route change.
4. Remove duplicated `lastSavedRef` patterns where possible.
5. Persist `borderTargets` through the shared config instead of `localStorage`.
6. Add `alerts` display settings support to the unified widget display defaults.
7. Change `AdminPolls` to a single `activePollId` model.
8. Normalize the navigation editor to one recursive `children` model.

### Phase 8. Remove direct reads from legacy storage

After the bridge is stable:

1. remove all direct reads of `theme_data.txt`, `widgets_data.txt`, and other split files from app startup
2. remove `WidgetContext` bootstrapping from `localStorage`
3. remove browser-only persistence for unit-wide config such as `borderTargets`
4. remove orphaned legacy fields such as `linksLayout`
5. delete the old per-domain save methods once migration is complete

### Phase 9. Harden the save pipeline

Before rollout, add these protections:

1. stable JSON stringify for deterministic diffs
2. schema validation on both load and save
3. ETag-aware SharePoint writes
4. conflict UI for stale saves
5. telemetry/logging for parse failures and save conflicts
6. optional local backup of last known good config in memory during the session

### Phase 10. Test the failure modes that matter

Minimum required tests:

1. load a perfect `1.0.0` config
2. load a partial `1.0.0` config with missing nested branches
3. load a malformed JSON file without crashing the app
4. migrate legacy split files into `1.0.0`
5. preserve `alerts` across save/load round trips
6. preserve `borderTargets` across save/load round trips
7. migrate legacy `activeWidget` into `widgets.active`
8. migrate legacy poll `active: true` flags into `activePollId`
9. preserve unknown future keys during load/save
10. reject invalid widget ids in `widgets.active`
11. reject stale ETag overwrites
12. verify new widget defaults appear automatically when missing in old config

### Phase 11. Cutover sequence

Recommended deployment sequence:

1. ship schema + adapter + provider behind a feature flag
2. verify legacy migration in mock mode
3. verify migration in a non-production SharePoint site
4. create the first real unified `config.txt`
5. switch runtime reads to the unified provider
6. disable legacy writes
7. remove legacy reads after confidence period

### Phase 12. Non-negotiable cleanup items

These should not be deferred:

1. fix `alerts` normalization
2. move `borderTargets` into shared config
3. replace split writes with one file write
4. add `schemaVersion`
5. remove client-side-only assumptions from admin authorization messaging

---

## 5. Bottom-Line Recommendations

1. Treat the current persistence model as a prototype, not a production deployment architecture.
2. Make one versioned config object the only source of truth.
3. Move all unit-wide visual and content settings into that object, including `borderTargets`.
4. Collapse events into the widgets branch so the home page really is driven by one state tree.
5. Preserve forward compatibility through migration + deep merge, not through scattered service fallbacks.
6. Do not trust the current admin-user list as secure authorization.

If this plan is followed, the app will satisfy the stated deployment model:

- one static build
- one SharePoint-hosted JSON text file per unit
- safe upgrades when new settings and widgets are added later
