# 🏗️ Premium Theme Architecture — Full Tinted Color Packages

> **Status:** Architecture / Pre-Implementation  
> **Date:** 2026-03-16  
> **Goal:** Replace flat "black/white + accent" with rich, depth-layered, glassmorphic tinted color packages.

---

## 1. Expanded Token Dictionary (12 Variables)

We upgrade from 5 flat `--surface-*` tokens to **12 semantic tokens** that enable gradients, glassmorphism, and tinted borders out of the box.

### 1.1 Token Table

| Token | Type | Purpose |
|---|---|---|
| **`--color-bg-base`** | Solid hex | The absolute bottom layer — `<html>`, `<body>`, `#root`. Content below any gradient. |
| **`--color-bg-gradient-start`** | Solid hex | Top/start of the ambient gradient applied to the Hero/Background layer. |
| **`--color-bg-gradient-end`** | Solid hex | Bottom/end of the ambient gradient. Fades into `--color-bg-base`. |
| **`--color-bg-chrome`** | `rgba(...)` | Semi-transparent tinted surface with `backdrop-blur`. Used for Navbar, Sidebar, Floating Bars — the "glass" layer. |
| **`--color-bg-card`** | Solid hex | Primary surface for cards, modals, panels (FlipCards, TacticalPanel, Commander). |
| **`--color-bg-card-hover`** | Solid hex | Card hover / elevated state. Slightly lighter/brighter than `--color-bg-card`. |
| **`--color-bg-elevated`** | Solid hex | Inner containers within cards — icon boxes, tag backgrounds, search input fill. |
| **`--color-border-subtle`** | `rgba(...)` | Low-contrast tinted border for cards, dividers, quiet separators. |
| **`--color-border-strong`** | `rgba(...)` | Higher-contrast tinted border for active states, hover rings, accent dividers. |
| **`--color-text-primary`** | Solid hex | Main text color — headings, body, labels. |
| **`--color-text-muted`** | Solid hex | Secondary text — descriptions, timestamps, placeholders. |
| **`--color-text-inverted`** | Solid hex | Text on primary-colored backgrounds (buttons, badges). Almost always `#ffffff`. |

### 1.2 Backwards Compatibility — Alias Layer

To avoid a "big-bang" refactor that touches 30+ files, we keep the old 5 tokens as **aliases** that still work everywhere:

```css
:root {
  /* Legacy aliases — components using these keep working */
  --surface-bg:         var(--color-bg-base);
  --surface-card:       var(--color-bg-card);
  --surface-elevated:   var(--color-bg-elevated);
  --surface-text:       var(--color-text-primary);
  --surface-text-muted: var(--color-text-muted);
}
```

This means **zero existing JSX changes are required** for basic compatibility. The new tokens are used incrementally as we upgrade individual components.

---

## 2. Component Mapping (The "אפיון")

### 2.1 Background / Hero Layer (`App.jsx` lines 560–580)

**Current state:** Five separate hardcoded gradient overlays using Tailwind classes (`from-gray-50 via-gray-50/80`, `dark:from-[#1a1d24] dark:via-[#1a1d24]/80`, etc.) stacked on top of the background images.

**Target architecture:**

```
┌──────────────────────────────────────────────┐
│ Layer 0: var(--color-bg-base)   — solid fill  │
│ Layer 1: Background images (rotating)         │
│ Layer 2: Radial vignette using --color-bg-base│
│ Layer 3: Ambient gradient:                    │
│          from var(--color-bg-gradient-start)   │
│          to   var(--color-bg-gradient-end)     │
│ Layer 4: Grid overlay (unchanged)             │
└──────────────────────────────────────────────┘
```

**What changes:**
- The **fixed background** (`div.fixed.inset-0`) gets `background: var(--color-bg-base)` instead of `bg-gray-50 dark:bg-[#1e212b]`.
- The **bottom fade** (`bg-gradient-to-t`) becomes:
  ```
  bg-gradient-to-t from-[var(--color-bg-gradient-end)] via-[var(--color-bg-gradient-end)]/80 to-transparent
  ```
- The **top fade** becomes:
  ```
  bg-gradient-to-b from-[var(--color-bg-gradient-start)]/80 via-transparent to-transparent
  ```
- The **side fades** (right/left) use `var(--color-bg-gradient-end)`.
- The **radial vignette** (already using `var(--surface-bg)`) automatically works via the alias.

**Result:** Instead of flat gray/charcoal surrounding the hero images, the user sees a rich tinted gradient that shifts with each theme — a deep navy vignette for Ocean, a burgundy fade for Crimson, an olive ambient glow for Forest.

### 2.2 Top Navbar (`App.jsx` line 584)

**Current state:** `bg-white/80 backdrop-blur-md border-b border-gray-200 dark:bg-[#1a1d24]/90 dark:border-white/5`

**Target architecture:**
```css
background: var(--color-bg-chrome);
backdrop-filter: blur(12px) saturate(180%);
-webkit-backdrop-filter: blur(12px) saturate(180%);
border-bottom: 1px solid var(--color-border-subtle);
```

**What changes:**
- Replace `bg-white/80 dark:bg-[#1a1d24]/90` with one CSS variable: `var(--color-bg-chrome)`.
- Increase `saturate()` to make glass feel polished (Apple-style).
- Border uses `var(--color-border-subtle)` instead of `border-gray-200 dark:border-white/5`.
- Buttons inside (`ניהול`, greeting, mode toggle) use `var(--color-bg-elevated)` as background.

**Result:** The Navbar becomes a tinted glass bar. In Ocean, it's a cool blue-tinted frosted glass. In Crimson, a warm burgundy frost. The saturate and blur combination keeps it premium, not transparent-looking.

### 2.3 Right Sidebar Nav (`RightSidebarNav.jsx`)

**Current state:** Level 1 buttons use `bg-white/80 dark:bg-[#1a1d24]/80 backdrop-blur-md border border-gray-200 dark:border-white/10`. Flyout panels use `bg-white/95 dark:bg-[#1a1d24]/95 backdrop-blur-md`.

**Target architecture:**
- **L1 Buttons:** `background: var(--color-bg-chrome); border: 1px solid var(--color-border-subtle);`
- **L2 Flyout Panel:** `background: var(--color-bg-card); border: 1px solid var(--color-border-subtle);`
- **L2/L3 Hover states:** `background: var(--color-bg-card-hover);`
- **L3 border-right accent:** `border-color: var(--color-border-strong);`

**Result:** The sidebar gains the same tinted glass as the navbar. The flyout panel uses the card token — a solid tinted surface that contrasts against the glass.

### 2.4 TacticalPanel / Commander & Widget (`App.jsx` line 386–396)

**Current state:** `bg-white border border-gray-200 dark:bg-[#232733] dark:border-white/5` — flat solid fill.

**Target architecture:**
```css
background: var(--color-bg-card);
border: 1px solid var(--color-border-subtle);
```

**Inner elements** (Commander image backdrop, icon containers):
```css
background: var(--color-bg-elevated);
border: 1px solid var(--color-border-subtle);
```

**Result:** Commander and Widget panels sit as solid tinted cards on top of the gradient background. In Ocean dark mode, you get a deep navy card on a darker navy gradient — visible but harmonious. The glow line colors remain driven by `--color-primary-hex`.

### 2.5 FlipCards (`App.jsx` FlipCard component, lines 28–74)

**Current state:** `bg-gradient-to-br from-white to-gray-50 dark:from-[#2a2e3b] dark:to-[#1e212b]` with `border border-gray-200 dark:border-white/10`.

**Target architecture:**
```css
/* Front face */
background: linear-gradient(135deg, var(--color-bg-card-hover), var(--color-bg-card));
border: 1px solid var(--color-border-subtle);

/* Hover state */
border-color: var(--color-border-strong);

/* Icon container inside card */
background: var(--color-bg-elevated);
border: 1px solid var(--color-border-subtle);
```

**Result:** FlipCards gain subtle internal gradients that match their theme. In Forest, front faces go from olive-tinted highlight to deeper olive. Borders get a warm green tint instead of neutral gray.

### 2.6 Categories Section / Content Area (`App.jsx` line 668)

**Current state:** `bg-gray-50/90 dark:bg-[#1e212b]/90 backdrop-blur-xl border-t border-gray-200 dark:border-primary/20`

**Target architecture:**
```css
background: color-mix(in srgb, var(--color-bg-base) 90%, transparent);
backdrop-filter: blur(16px);
border-top: 1px solid var(--color-border-strong);
```

**Result:** The content/category section below the hero transitions from "just another gray area" to a tinted, slightly transparent surface with blur, creating visual continuity with the hero above.

### 2.7 Footer / External Links Bar (`App.jsx` line 540)

**Current state:** `bg-gray-50 dark:bg-[#1e212b]` with `border-t border-gray-200 dark:border-white/5`.

**Target architecture:**
```css
background: var(--color-bg-card);
border-top: 1px solid var(--color-border-subtle);
```

Floating bar: `background: var(--color-bg-chrome); backdrop-filter: blur(12px) saturate(180%);`

**Result:** Footer becomes a solid tinted card surface. The floating bar becomes a glass element like the navbar.

### 2.8 SearchBar (`App.jsx` lines 401–432)

**Current state:** Inner fill is `bg-white` (hardcoded), outer glow layer is `bg-gray-50 dark:bg-[#1e212b]`.

**Target architecture:**
- Outer fill: `var(--color-bg-elevated)`
- Inner fill: `var(--color-bg-card)` (instead of pure white)
- Text: `color: var(--color-text-primary)`
- Placeholder: `color: var(--color-text-muted)`

### 2.9 Scrollbars (`index.css`)

**Current state:** Hardcoded `#f0f0f0`, `#0a0c0f`, `#c0c0c0`, `#374151`.

**Target architecture:**
```css
::-webkit-scrollbar-track { background: var(--color-bg-elevated); }
::-webkit-scrollbar-thumb { background: var(--color-border-strong); }
::-webkit-scrollbar-thumb:hover { background: var(--color-primary-500); }
```

---

## 3. Refined Color Packages

### Design Rules

> [!IMPORTANT]
> - **Light mode:** NO pure white (`#ffffff`) for backgrounds. Only `--color-bg-card` in very specific cases gets near-white. All other surfaces are tinted.
> - **Dark mode:** NO flat Tailwind grays. All surfaces have real color depth — deep, almost-black tints that look rich on premium displays.
> - **Chrome (glass):** Always `rgba()` with `backdrop-blur`. Not a solid color hack.
> - **Borders:** Never pure gray. Always tinted to match the package.

---

### 3.1 🏛️ Classic — ברירת מחדל

> Clean, neutral grayscale. Preserves the current look but with premium depth via gradients.

#### Dark Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#0c0d12` |
| `--color-bg-gradient-start` | `#14151c` |
| `--color-bg-gradient-end` | `#0a0b0f` |
| `--color-bg-chrome` | `rgba(18, 19, 26, 0.85)` |
| `--color-bg-card` | `#1a1c23` |
| `--color-bg-card-hover` | `#20232c` |
| `--color-bg-elevated` | `#252830` |
| `--color-border-subtle` | `rgba(255, 255, 255, 0.06)` |
| `--color-border-strong` | `rgba(255, 255, 255, 0.12)` |
| `--color-text-primary` | `#f0f1f4` |
| `--color-text-muted` | `#9ca3af` |
| `--color-text-inverted` | `#ffffff` |

#### Light Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#f2f3f5` |
| `--color-bg-gradient-start` | `#eaebef` |
| `--color-bg-gradient-end` | `#f5f6f8` |
| `--color-bg-chrome` | `rgba(248, 249, 251, 0.82)` |
| `--color-bg-card` | `#fafbfc` |
| `--color-bg-card-hover` | `#f4f5f7` |
| `--color-bg-elevated` | `#edeef1` |
| `--color-border-subtle` | `rgba(0, 0, 0, 0.06)` |
| `--color-border-strong` | `rgba(0, 0, 0, 0.12)` |
| `--color-text-primary` | `#111827` |
| `--color-text-muted` | `#6b7280` |
| `--color-text-inverted` | `#ffffff` |

---

### 3.2 🌊 Ocean — כחול ים

> Deep steel-blue tints. Professional, commanding, trustworthy.

#### Dark Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#080c14` |
| `--color-bg-gradient-start` | `#0e1726` |
| `--color-bg-gradient-end` | `#060a10` |
| `--color-bg-chrome` | `rgba(10, 18, 34, 0.85)` |
| `--color-bg-card` | `#0f1724` |
| `--color-bg-card-hover` | `#162030` |
| `--color-bg-elevated` | `#1a2840` |
| `--color-border-subtle` | `rgba(100, 160, 230, 0.08)` |
| `--color-border-strong` | `rgba(100, 160, 230, 0.16)` |
| `--color-text-primary` | `#e0e8f4` |
| `--color-text-muted` | `#7a90b5` |
| `--color-text-inverted` | `#ffffff` |

#### Light Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#ebf0f7` |
| `--color-bg-gradient-start` | `#dce5f2` |
| `--color-bg-gradient-end` | `#f0f4f9` |
| `--color-bg-chrome` | `rgba(230, 238, 250, 0.82)` |
| `--color-bg-card` | `#f4f7fc` |
| `--color-bg-card-hover` | `#eaeff8` |
| `--color-bg-elevated` | `#dfe6f2` |
| `--color-border-subtle` | `rgba(30, 80, 160, 0.08)` |
| `--color-border-strong` | `rgba(30, 80, 160, 0.16)` |
| `--color-text-primary` | `#0c1628` |
| `--color-text-muted` | `#4a6080` |
| `--color-text-inverted` | `#ffffff` |

---

### 3.3 🔴 Crimson — אדום עמוק

> Rich burgundy/maroon warmth. Military command center, authoritative.

#### Dark Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#0e0809` |
| `--color-bg-gradient-start` | `#1a0e10` |
| `--color-bg-gradient-end` | `#0a0607` |
| `--color-bg-chrome` | `rgba(28, 12, 16, 0.85)` |
| `--color-bg-card` | `#1a1012` |
| `--color-bg-card-hover` | `#241618` |
| `--color-bg-elevated` | `#301c20` |
| `--color-border-subtle` | `rgba(220, 100, 120, 0.08)` |
| `--color-border-strong` | `rgba(220, 100, 120, 0.16)` |
| `--color-text-primary` | `#f4e4e6` |
| `--color-text-muted` | `#b08088` |
| `--color-text-inverted` | `#ffffff` |

#### Light Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#f5ecec` |
| `--color-bg-gradient-start` | `#eedee0` |
| `--color-bg-gradient-end` | `#f8f0f0` |
| `--color-bg-chrome` | `rgba(248, 232, 234, 0.82)` |
| `--color-bg-card` | `#faf4f4` |
| `--color-bg-card-hover` | `#f2e8e9` |
| `--color-bg-elevated` | `#e8d8da` |
| `--color-border-subtle` | `rgba(160, 40, 60, 0.08)` |
| `--color-border-strong` | `rgba(160, 40, 60, 0.16)` |
| `--color-text-primary` | `#1a0a0c` |
| `--color-text-muted` | `#7a4a50` |
| `--color-text-inverted` | `#ffffff` |

---

### 3.4 🌲 Forest — ירוק טקטי

> Deep jungle olive. Tactical, military, IDF mission-grade aesthetic.

#### Dark Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#080c09` |
| `--color-bg-gradient-start` | `#0e1a10` |
| `--color-bg-gradient-end` | `#060a07` |
| `--color-bg-chrome` | `rgba(12, 24, 14, 0.85)` |
| `--color-bg-card` | `#0f1810` |
| `--color-bg-card-hover` | `#162218` |
| `--color-bg-elevated` | `#1c3020` |
| `--color-border-subtle` | `rgba(100, 200, 120, 0.08)` |
| `--color-border-strong` | `rgba(100, 200, 120, 0.16)` |
| `--color-text-primary` | `#e0f0e4` |
| `--color-text-muted` | `#7aaa84` |
| `--color-text-inverted` | `#ffffff` |

#### Light Mode

| Token | Value |
|---|---|
| `--color-bg-base` | `#ecf2ed` |
| `--color-bg-gradient-start` | `#dce8de` |
| `--color-bg-gradient-end` | `#f0f5f1` |
| `--color-bg-chrome` | `rgba(230, 244, 232, 0.82)` |
| `--color-bg-card` | `#f4f9f5` |
| `--color-bg-card-hover` | `#e8f0ea` |
| `--color-bg-elevated` | `#dae6dc` |
| `--color-border-subtle` | `rgba(40, 120, 50, 0.08)` |
| `--color-border-strong` | `rgba(40, 120, 50, 0.16)` |
| `--color-text-primary` | `#0c1a0e` |
| `--color-text-muted` | `#4a6e50` |
| `--color-text-inverted` | `#ffffff` |

---

## 4. CSS Architecture: The `data-theme` Cascade

### 4.1 Layer Order

```
1. :root                              → Classic Dark defaults (all 12 tokens)
2. html:not(.dark)                    → Classic Light overrides
3. html.dark[data-theme="ocean"]      → Ocean Dark overrides (all 12 tokens)
4. html:not(.dark)[data-theme="ocean"]→ Ocean Light overrides (all 12 tokens)
   ... same for crimson, forest
```

### 4.2 Why Not JS?

The `ThemeContext.applyDisplayMode()` currently does `root.style.setProperty(...)` for each token. This approach **breaks** cascade specificity — inline styles win over stylesheet rules, so `data-theme` CSS rules would be ignored.

**The fix:** Remove the inline `setProperty` calls for surface tokens from `applyDisplayMode()`. Let the CSS stylesheet handle it. ThemeContext only needs to:

1. `root.classList.toggle('dark', mode === 'dark')` — toggles light/dark
2. `root.dataset.theme = colorPackage || 'classic'` — activates the package

This is **cleaner**, **faster** (no JS `setProperty` × 12), and **maintainable** (adding a new theme = one CSS block).

### 4.3 Ready-to-Use CSS Block

```css
/* ============================================================
   PREMIUM COLOR PACKAGES — Tinted Surface Architecture
   Activated via data-theme="<package>" on <html>
   ============================================================ */

/* ── CLASSIC (DEFAULT) — DARK ── */
:root {
  --color-bg-base:         #0c0d12;
  --color-bg-gradient-start:#14151c;
  --color-bg-gradient-end:  #0a0b0f;
  --color-bg-chrome:        rgba(18, 19, 26, 0.85);
  --color-bg-card:          #1a1c23;
  --color-bg-card-hover:    #20232c;
  --color-bg-elevated:      #252830;
  --color-border-subtle:    rgba(255, 255, 255, 0.06);
  --color-border-strong:    rgba(255, 255, 255, 0.12);
  --color-text-primary:     #f0f1f4;
  --color-text-muted:       #9ca3af;
  --color-text-inverted:    #ffffff;

  /* Legacy aliases */
  --surface-bg:         var(--color-bg-base);
  --surface-card:       var(--color-bg-card);
  --surface-elevated:   var(--color-bg-elevated);
  --surface-text:       var(--color-text-primary);
  --surface-text-muted: var(--color-text-muted);
}

/* ── CLASSIC — LIGHT ── */
html:not(.dark) {
  --color-bg-base:         #f2f3f5;
  --color-bg-gradient-start:#eaebef;
  --color-bg-gradient-end:  #f5f6f8;
  --color-bg-chrome:        rgba(248, 249, 251, 0.82);
  --color-bg-card:          #fafbfc;
  --color-bg-card-hover:    #f4f5f7;
  --color-bg-elevated:      #edeef1;
  --color-border-subtle:    rgba(0, 0, 0, 0.06);
  --color-border-strong:    rgba(0, 0, 0, 0.12);
  --color-text-primary:     #111827;
  --color-text-muted:       #6b7280;
  --color-text-inverted:    #ffffff;
}

/* ── OCEAN — DARK ── */
html.dark[data-theme="ocean"] {
  --color-bg-base:         #080c14;
  --color-bg-gradient-start:#0e1726;
  --color-bg-gradient-end:  #060a10;
  --color-bg-chrome:        rgba(10, 18, 34, 0.85);
  --color-bg-card:          #0f1724;
  --color-bg-card-hover:    #162030;
  --color-bg-elevated:      #1a2840;
  --color-border-subtle:    rgba(100, 160, 230, 0.08);
  --color-border-strong:    rgba(100, 160, 230, 0.16);
  --color-text-primary:     #e0e8f4;
  --color-text-muted:       #7a90b5;
  --color-text-inverted:    #ffffff;
}

/* ── OCEAN — LIGHT ── */
html:not(.dark)[data-theme="ocean"] {
  --color-bg-base:         #ebf0f7;
  --color-bg-gradient-start:#dce5f2;
  --color-bg-gradient-end:  #f0f4f9;
  --color-bg-chrome:        rgba(230, 238, 250, 0.82);
  --color-bg-card:          #f4f7fc;
  --color-bg-card-hover:    #eaeff8;
  --color-bg-elevated:      #dfe6f2;
  --color-border-subtle:    rgba(30, 80, 160, 0.08);
  --color-border-strong:    rgba(30, 80, 160, 0.16);
  --color-text-primary:     #0c1628;
  --color-text-muted:       #4a6080;
  --color-text-inverted:    #ffffff;
}

/* ── CRIMSON — DARK ── */
html.dark[data-theme="crimson"] {
  --color-bg-base:         #0e0809;
  --color-bg-gradient-start:#1a0e10;
  --color-bg-gradient-end:  #0a0607;
  --color-bg-chrome:        rgba(28, 12, 16, 0.85);
  --color-bg-card:          #1a1012;
  --color-bg-card-hover:    #241618;
  --color-bg-elevated:      #301c20;
  --color-border-subtle:    rgba(220, 100, 120, 0.08);
  --color-border-strong:    rgba(220, 100, 120, 0.16);
  --color-text-primary:     #f4e4e6;
  --color-text-muted:       #b08088;
  --color-text-inverted:    #ffffff;
}

/* ── CRIMSON — LIGHT ── */
html:not(.dark)[data-theme="crimson"] {
  --color-bg-base:         #f5ecec;
  --color-bg-gradient-start:#eedee0;
  --color-bg-gradient-end:  #f8f0f0;
  --color-bg-chrome:        rgba(248, 232, 234, 0.82);
  --color-bg-card:          #faf4f4;
  --color-bg-card-hover:    #f2e8e9;
  --color-bg-elevated:      #e8d8da;
  --color-border-subtle:    rgba(160, 40, 60, 0.08);
  --color-border-strong:    rgba(160, 40, 60, 0.16);
  --color-text-primary:     #1a0a0c;
  --color-text-muted:       #7a4a50;
  --color-text-inverted:    #ffffff;
}

/* ── FOREST — DARK ── */
html.dark[data-theme="forest"] {
  --color-bg-base:         #080c09;
  --color-bg-gradient-start:#0e1a10;
  --color-bg-gradient-end:  #060a07;
  --color-bg-chrome:        rgba(12, 24, 14, 0.85);
  --color-bg-card:          #0f1810;
  --color-bg-card-hover:    #162218;
  --color-bg-elevated:      #1c3020;
  --color-border-subtle:    rgba(100, 200, 120, 0.08);
  --color-border-strong:    rgba(100, 200, 120, 0.16);
  --color-text-primary:     #e0f0e4;
  --color-text-muted:       #7aaa84;
  --color-text-inverted:    #ffffff;
}

/* ── FOREST — LIGHT ── */
html:not(.dark)[data-theme="forest"] {
  --color-bg-base:         #ecf2ed;
  --color-bg-gradient-start:#dce8de;
  --color-bg-gradient-end:  #f0f5f1;
  --color-bg-chrome:        rgba(230, 244, 232, 0.82);
  --color-bg-card:          #f4f9f5;
  --color-bg-card-hover:    #e8f0ea;
  --color-bg-elevated:      #dae6dc;
  --color-border-subtle:    rgba(40, 120, 50, 0.08);
  --color-border-strong:    rgba(40, 120, 50, 0.16);
  --color-text-primary:     #0c1a0e;
  --color-text-muted:       #4a6e50;
  --color-text-inverted:    #ffffff;
}
```

---

## 5. Tailwind Config Extension

To use the new tokens across JSX without custom style attributes:

```js
// tailwind.config.js — extend colors
surface: {
  bg:       'var(--color-bg-base)',       // aliased for backwards compat
  card:     'var(--color-bg-card)',
  elevated: 'var(--color-bg-elevated)',
  text:     'var(--color-text-primary)',
  muted:    'var(--color-text-muted)',
},
theme: {
  'bg-base':    'var(--color-bg-base)',
  'grad-start': 'var(--color-bg-gradient-start)',
  'grad-end':   'var(--color-bg-gradient-end)',
  'chrome':     'var(--color-bg-chrome)',
  'card':       'var(--color-bg-card)',
  'card-hover': 'var(--color-bg-card-hover)',
  'elevated':   'var(--color-bg-elevated)',
},
borderColor: {
  'theme-subtle': 'var(--color-border-subtle)',
  'theme-strong': 'var(--color-border-strong)',
},
textColor: {
  'theme':       'var(--color-text-primary)',
  'theme-muted': 'var(--color-text-muted)',
  'theme-inv':   'var(--color-text-inverted)',
},
```

This enables classes like:
- `bg-theme-chrome backdrop-blur-xl` — glass navbar
- `bg-theme-card border border-theme-subtle` — tinted card
- `text-theme-muted` — muted text that auto-tints
- `from-theme-grad-start to-theme-grad-end` — ambient gradient

---

## 6. Hardcoded Hex Inventory (Files to Touch)

A complete audit of hardcoded hex values that need replacement during implementation:

### `App.jsx`

| Line(s) | Current Value | Replace With |
|---|---|---|
| 41, 54 (FlipCard) | `dark:from-[#2a2e3b] dark:to-[#1e212b]` | `dark:from-[var(--color-bg-card-hover)] dark:to-[var(--color-bg-card)]` |
| 41, 54 (FlipCard) | `from-white to-gray-50` | `from-[var(--color-bg-card)] to-[var(--color-bg-card-hover)]` (or reversed) |
| 41, 54 (FlipCard) | `border-gray-200 dark:border-white/10` | `border-[var(--color-border-subtle)]` |
| 387 (TacticalPanel) | `bg-white dark:bg-[#232733]` | `bg-[var(--color-bg-card)]` |
| 387 (TacticalPanel) | `border-gray-200 dark:border-white/5` | `border-[var(--color-border-subtle)]` |
| 558 | `bg-gray-50 dark:bg-[#1e212b]` | `bg-[var(--color-bg-base)]` |
| 561 | `bg-gray-50 dark:bg-[#1e212b]` | `bg-[var(--color-bg-base)]` |
| 576 | `from-gray-50 dark:from-[#1a1d24]` etc. | `from-[var(--color-bg-gradient-end)]` etc. |
| 577 | `from-gray-50/80 dark:from-[#1e212b]/80` | `from-[var(--color-bg-gradient-start)]` |
| 578 | `from-gray-50 dark:from-[#1e212b]` | `from-[var(--color-bg-gradient-end)]` |
| 579 | `from-gray-50 dark:from-[#1e212b]` | `from-[var(--color-bg-gradient-end)]` |
| 584 (Navbar) | `bg-white/80 dark:bg-[#1a1d24]/90` | `bg-[var(--color-bg-chrome)]` |
| 584 (Navbar) | `border-gray-200 dark:border-white/5` | `border-[var(--color-border-subtle)]` |
| 600, 606, 614 | `bg-white/60 dark:bg-[#12141a]/60` | `bg-[var(--color-bg-elevated)]` |
| 668 | `bg-gray-50/90 dark:bg-[#1e212b]/90` | `bg-[color-mix(in srgb, var(--color-bg-base) 90%, transparent)]` |

### `RightSidebarNav.jsx`

| Line | Current Value | Replace With |
|---|---|---|
| 78, 90 (L1 buttons) | `bg-white/80 dark:bg-[#1a1d24]/80` | `bg-[var(--color-bg-chrome)]` |
| 107 (L2 flyout) | `bg-white/95 dark:bg-[#1a1d24]/95` | `bg-[var(--color-bg-card)]` |
| All borders | `border-gray-200 dark:border-white/10` | `border-[var(--color-border-subtle)]` |

### `index.css`

| Line | Current Value | Replace With |
|---|---|---|
| 96 | `::-webkit-scrollbar-track { #f0f0f0 }` | `var(--color-bg-elevated)` |
| 101 | `.dark scrollbar-track { #0a0c0f }` | `var(--color-bg-base)` |
| 128 | `scrollbar-thumb { #c0c0c0 }` | `var(--color-border-strong)` |
| 134 | `.dark scrollbar-thumb { #374151 }` | `var(--color-border-strong)` |

### `ThemeContext.jsx`

| Function | Change |
|---|---|
| `applyDisplayMode()` | Remove all `root.style.setProperty('--surface-*', ...)` calls. Only toggle `.dark` class. |
| `applyThemeToDom()` | Add `root.dataset.theme = themeData.colorPackage \|\| 'classic'` |
| `applyThemeToElement()` | Add `el.dataset.theme = themeData.colorPackage \|\| 'classic'`, remove inline surface setProperty calls. |

---

## 7. ThemeContext Minimal Changes

```js
function applyDisplayMode(effectiveMode) {
  const root = document.documentElement;
  if (effectiveMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // ← Surface tokens are now handled by CSS cascade, NOT JS
}

function applyColorPackage(packageId) {
  document.documentElement.dataset.theme = packageId || 'classic';
}
```

The `applyThemeToDom` callback becomes:
```js
const applyThemeToDom = useCallback((themeData) => {
  if (!themeData) return;
  applyPrimaryColorVars(themeData.primaryColor || '#dc2626');
  applyColorPackage(themeData.colorPackage);          // ← NEW
  const mode = resolveDisplayMode(themeData.displayMode || 'dark');
  setSiteMode(mode);
}, []);
```

---

## 8. Admin UI — Theme Package Picker

A new `'colorPackage'` tab in `SETTINGS_NAV` with a **2×2 grid of tinted cards**. Each card shows:
1. A **3-layer stacked swatch** (base → card → elevated colors) to preview depth.
2. Hebrew label + English name.
3. Active ring + check indicator.

```js
const COLOR_PACKAGES = [
  {
    value: 'classic', label: 'Classic', labelHe: 'קלאסי',
    description: 'גווני אפור נקיים עם עומק פרימיום',
    swatch: { base: '#0c0d12', card: '#1a1c23', elevated: '#252830' },
  },
  {
    value: 'ocean', label: 'Ocean', labelHe: 'כחול ים',
    description: 'גווני כחול עמוק לתחושת אמינות ופיקוד',
    swatch: { base: '#080c14', card: '#0f1724', elevated: '#1a2840' },
  },
  {
    value: 'crimson', label: 'Crimson', labelHe: 'אדום עמוק',
    description: 'בורגנדי עשיר עם נוכחות מפקדת',
    swatch: { base: '#0e0809', card: '#1a1012', elevated: '#301c20' },
  },
  {
    value: 'forest', label: 'Forest', labelHe: 'ירוק טקטי',
    description: 'ירוק זית ביער — מראה צבאי טקטי',
    swatch: { base: '#080c09', card: '#0f1810', elevated: '#1c3020' },
  },
];
```

---

## 9. Implementation Order (Suggested Phases)

| Phase | Work | Files |
|---|---|---|
| **1** | Add 12-token definitions + `data-theme` CSS blocks to `index.css` | `index.css` |
| **2** | Extend `tailwind.config.js` with new color tokens | `tailwind.config.js` |
| **3** | Refactor `ThemeContext.jsx` — remove inline surface setProperty, add `data-theme` setter | `ThemeContext.jsx` |
| **4** | Add ColorPackage picker to `AdminTheme.jsx` | `AdminTheme.jsx` |
| **5** | Migrate Hero/Background layer in `App.jsx` to use gradient tokens | `App.jsx` |
| **6** | Migrate Navbar + Sidebar to use chrome token | `App.jsx`, `RightSidebarNav.jsx` |
| **7** | Migrate Cards (FlipCard, TacticalPanel) to use card + border tokens | `App.jsx` |
| **8** | Migrate scrollbars + remaining hardcoded values | `index.css` |
| **9** | Update `ThemeLivePreview` for `data-theme` support | `ThemeLivePreview.jsx` |
| **10** | QA: Test 4 packages × 2 modes = 8 visual permutations | Browser |
