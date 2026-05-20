# Product Requirements Document (PRD): Dynamic White-Label CMS Upgrade for React Portal

## 1. Project Objective
Upgrade the existing static-like React SPA into a flexible, highly scalable "White-label" CMS platform. The core idea is to provide this system to different unit admins as a "demo site," equipped with an advanced Admin Panel. This panel will allow each admin to fully customize their site's content, active widgets, and exact visual UI/Theme without touching the codebase.

## 2. Front-End Architecture (Dynamic Blocks)
The homepage must be refactored into fully dynamic blocks, driven by the data/settings provided via the Admin Panel:

* **Section 1: Hero Area:** Contains the main site title, description, and background/theme image. All texts and media are injected dynamically from the admin settings.
* **Section 2: Commander's Message:** Displays the commander's portrait and message. The system must support up to 3 rotating messages. 
    * *Conditional Logic:* If the admin inputs only one message, the pagination/navigation arrows must be automatically hidden and replaced by a small, static decorative design element.
* **Section 3: Dynamic Widget Area:** Currently hardcoded as "Monthly Events", this section will now dynamically render a widget based on what the admin selected in the new "Widget Management" interface (details below).
* **Section 4: External Links (Footer Area):** A newly added section at the absolute bottom of the page. It displays a row of external system links. Each item consists of an uploaded image/icon, a title, and a clickable URL.

## 3. Admin Panel Architecture (Modular & Dynamic)
The current Admin UI must be expanded into a smart, modular system containing the following tabs:

### A. Information Management (ניהול המידע)
Controls the static content for Sections 1 & 2:
* Edit Hero title, description, and background image.
* Manage the "Commander's Message" (add up to 3 text items and replace the commander's image).

### B. Links Management (ניהול לינקים)
* Refactor the existing "AdminNavigation" into this tab.
* Manage the smart tree of categories and sub-categories.
* *Feature Addition:* Ability to define a parent category as a "Direct Link". Doing so will visually disable/hide its child sub-links on the front-end, without deleting them from the database.

### C. Widget Management (ניהול ווידגטים) - *NEW CORE MODULE*
A smart gallery system for selecting the active module for Section 3:
* Displays a gallery of available widgets.
* Features a live preview pane on the left side showing the currently hovered/selected widget.
* *Smart Menu Logic:* Selecting a widget dynamically injects its specific management tab into the main admin sidebar. (e.g., Selecting the "Events" widget makes the "Events Management" tab appear in the sidebar).

### D. [Active Widget] Management (Dynamic Tab)
* This tab is conditionally rendered in the sidebar *only* if the specific widget is activated in step C.
* Contains all CRUD operations and specific settings for that module (e.g., managing dates, titles, and "Red/Gray" status for the Events widget).

### E. Theme & Styling Management (ניהול עיצוב האתר)
A dedicated panel to control the global UI/UX of the portal:
* **Primary Color:** A color picker that dynamically overrides the main Tailwind color palette across the entire site.
* **Display Mode:** Admin can force Light mode, force Dark mode, or enable a UI toggle for the end-user.
* **Complex Borders:** A catalog of border/shape styles for components (cards, sections). *Requirement:* Do not just use standard `rounded-md`. Implement complex shapes using custom Tailwind utilities or `clip-path` (e.g., a shape where two opposite corners are angled/clipped and the other two are straight, mimicking modern tactical UI).
* **Navigation & Links Layout:** * Allow the admin to choose from multiple display templates/layouts for Section 4 (e.g., small cards, clean icons, carousel).
    * A toggle to show or hide the link categories in the top navigation bar.

### F. External Links Management (ניהול קישורים חיצוניים)
* **Content:** Interface to Add/Edit/Delete external links (Fields: Image Upload, Title, URL).
* **Design:** Dropdown to select the visual layout for Section 4 on the front-end (as defined in the Theme section).

## Execution Instructions for AI Agent:
Please read this PRD carefully. Generate a comprehensive step-by-step implementation PLAN. Do not start coding immediately. Output the plan first so we can review the proposed database schema changes, state management updates (Context API), and Tailwind configuration adjustments needed to support this dynamic architecture.

--


## AI Agent Execution Plan: Step-by-Step Implementation

**CRITICAL INSTRUCTION FOR AI:** Do NOT write the entire application code at once. Acknowledge this complete PRD and Plan first. We will execute this strictly step-by-step. I will prompt you to "Begin Phase 1", "Begin Phase 2", etc. You must wait for my command before writing the code for each phase.

### Phase 1: Foundation & Data Schema Evolution
* Expand the `sharepoint.config.js` and local storage mock structures to support the new required data schemas: `ThemeSettings` (colors, borders, layout), `WidgetsConfig` (active widget, widget settings), `ExternalLinks`, and the expanded `CommanderData` (array of items).
* Update or create the necessary React Contexts (`ThemeContext`, `WidgetContext`, `ExternalLinksContext`) to manage global state without Redux.
* Ensure data persistence functions (both `localStorage` and `SharePointService`) can handle the new JSON tree.

### Phase 2: The Theme Engine & Styling Layer
* Implement the dynamic CSS variable system in `index.css` and map them inside `tailwind.config.js` to allow dynamic Primary Color injection.
* Implement the Light/Dark mode toggle logic (Context + Tailwind dark mode configuration).
* Create custom Tailwind utility classes for the "Complex Borders" (e.g., custom `clip-path` classes mimicking the tactical design with clipped corners).

### Phase 3: Admin Shell & Core Management Refactor
* Refactor `AdminHub.jsx` to support dynamic routing and conditional sidebar rendering based on active modules.
* Update the "Information Management" tab to handle the new dynamic Hero fields and the array-based Commander's messages.
* Refactor the existing Navigation manager into the new "Links Management" tab, adding the "Direct Link" toggle functionality to hide child links visually.

### Phase 4: Dynamic Widget & Theme Administration
* Build the "Widget Management" gallery UI with the live preview pane.
* Implement the logic that dynamically adds the specific widget's management tab (e.g., "Events Management") to the sidebar only when selected.
* Build the "Theme & Styling" control panel (color picker, dark mode toggle, layout selectors, border style selectors).
* Build the "External Links" CRUD management interface.

### Phase 5: Front-End Assembly (Dynamic Homepage)
* Refactor `Home.jsx` to read from the new Contexts and conditionally render layout blocks.
* Implement the dynamic Hero Section and the rotating Commander's Message component (including the fallback UI if only one message exists).
* Build the "Dynamic Widget Area" that reads the currently active widget from context and renders the correct component (e.g., `EventsList`).
* Build the "External Links Footer" section applying the admin-selected layout template.

### Phase 6: Testing, Wiring & Edge Cases
* Ensure seamless fallback values if data is missing.
* Verify real-time UI updates across the app when a Theme setting is changed in the Admin panel.
* Finalize SharePoint Form Digest and file overwrite logic for the expanded JSON states.

