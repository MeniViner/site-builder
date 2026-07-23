import { test, expect } from '@playwright/test';

test.describe('Right sidebar visual/layout verification', () => {
  const viewports = [
    { w: 1366, h: 768, name: '1366x768' },
    { w: 1920, h: 1080, name: '1920x1080' },
    { w: 2560, h: 1440, name: '2560x1440' },
  ];

  for (const viewport of viewports) {
    test(`right-sidebar ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.w, height: viewport.h });
      await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);

      await page.waitForSelector('.right-sidebar-nav', { timeout: 15000 });
      await page.waitForSelector('.sidebar-nav-item--top-level', { timeout: 8000 });

      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector('.right-sidebar-nav');
        const main = document.querySelector('main.home-portal-main');
        const scrollContainer = document.querySelector('.right-sidebar-nav__scroll');
        const triggerButtons = Array.from(document.querySelectorAll('.right-sidebar-nav .sidebar-nav-item--top-level'));
        const first = triggerButtons[0];
        const rect = sidebar?.getBoundingClientRect();
        const header = document.querySelector('nav');
        const headerRect = header?.getBoundingClientRect();

        const itemRects = triggerButtons.map((el) => {
          const icon = el.querySelector('.sidebar-nav-item__icon-box');
          const label = el.querySelector('.sidebar-nav-item__label');
          return {
            iconW: icon?.getBoundingClientRect().width || 0,
            iconH: icon?.getBoundingClientRect().height || 0,
            labelW: label?.getBoundingClientRect().width || 0,
            labelFont: getComputedStyle(label || el).fontSize,
          };
        });

        const firstLabelAfterBox = (() => {
          if (!first) return null;
          const icon = first.querySelector('.sidebar-nav-item__icon-box');
          const label = first.querySelector('.sidebar-nav-item__label');
          if (!icon || !label) return null;
          return {
            iconBottom: icon.getBoundingClientRect().bottom,
            labelTop: label.getBoundingClientRect().top,
          };
        })();

        const overflow =
          (document.documentElement.scrollWidth || 0) - (window.innerWidth || 0);

        return {
          sidebar: sidebar ? { left: rect.left, right: rect.right, width: rect.width, top: rect.top } : null,
          mainHasSidebarPadding: main ? getComputedStyle(main).paddingRight : null,
          scrollContainer: scrollContainer
            ? {
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight,
            }
            : null,
          triggerCount: triggerButtons.length,
          firstLabelAfterBox,
          headerBottom: headerRect?.bottom,
          itemRects,
          horizontalOverflow: overflow,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          commanderImg: (() => {
            const img = document.querySelector('img[alt="Commander"]');
            if (!img) return null;
            const r = img.getBoundingClientRect();
            return {
              top: r.top,
              left: r.left,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          })(),
        };
      });

      const { sidebar, mainHasSidebarPadding, scrollContainer, firstLabelAfterBox, itemRects, horizontalOverflow } = metrics;

      expect(sidebar).not.toBeNull();
      expect.soft(sidebar.right).toBeGreaterThanOrEqual(viewport.w - 3);
      expect.soft(sidebar.left).toBeGreaterThan(viewport.w / 2);

      if (viewport.w >= 1024) {
        const pad = Number.parseFloat(mainHasSidebarPadding || '0');
        expect.soft(pad).toBeGreaterThan(0);
      }

      expect.soft(horizontalOverflow).toBeLessThanOrEqual(2);
      expect.soft(itemRects.length).toBeGreaterThan(0);

      if (firstLabelAfterBox) {
        expect.soft(firstLabelAfterBox.labelTop).toBeGreaterThan(firstLabelAfterBox.iconBottom);
      }

      for (const r of itemRects) {
        expect.soft(r.iconW, `icon width ${r.iconW}`).toBeGreaterThanOrEqual(40);
        expect.soft(r.iconW, `icon width ${r.iconW}`).toBeLessThanOrEqual(56);
        expect.soft(r.iconH, `icon height ${r.iconH}`).toBeGreaterThanOrEqual(40);
        expect.soft(r.iconH, `icon height ${r.iconH}`).toBeLessThanOrEqual(56);
      }

      const canScroll = scrollContainer
        ? scrollContainer.scrollHeight > scrollContainer.clientHeight + 2
        : false;
      const lastVisibleInitial = await page.locator('.right-sidebar-nav .sidebar-nav-item--top-level:last-child').isVisible();
      if (!lastVisibleInitial && canScroll) {
        await page.locator('.right-sidebar-nav__scroll').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.waitForTimeout(200);
      }
      const lastVisibleFinal = await page.locator('.right-sidebar-nav .sidebar-nav-item--top-level:last-child').isVisible();
      const firstVisible = await page.locator('.right-sidebar-nav .sidebar-nav-item--top-level:first-child').isVisible();
      expect.soft(firstVisible, 'first item visible').toBeTruthy();
      expect.soft(lastVisibleFinal, 'last item reachable').toBeTruthy();

      await page.screenshot({
        path: `artifacts/right-sidebar-verify/${viewport.name}.png`,
        fullPage: true,
      });

      console.log(JSON.stringify({
        viewport: `${viewport.w}x${viewport.h}`,
        sidebar,
        mainHasSidebarPadding,
        triggerCount: itemRects.length,
        canScroll,
        horizontalOverflow,
      }, null, 2));
    });
  }
});
