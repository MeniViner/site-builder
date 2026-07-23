const { test, expect } = require('@playwright/test');

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
        const last = triggerButtons[triggerButtons.length - 1];
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
          firstItemText: first ? first.textContent?.trim() : '',
          lastItemText: last ? last.textContent?.trim() : '',
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

      const { sidebar, mainHasSidebarPadding, scrollContainer, firstLabelAfterBox, triggerCount, itemRects, horizontalOverflow } = metrics;

      if (!sidebar) throw new Error('Right sidebar missing');
      if (sidebar.right < viewport.w - 3) {
        throw new Error(`Sidebar not attached to right edge: right=${sidebar.right}, viewport=${viewport.w}`);
      }
      if (sidebar.left <= viewport.w / 2) {
        throw new Error(`Sidebar anchored leftward: left=${sidebar.left}`);
      }

      if (viewport.w >= 1024) {
        const pad = Number.parseFloat(mainHasSidebarPadding || '0');
        if (!(pad > 0)) {
          throw new Error(`Expected main content right padding > 0, got ${mainHasSidebarPadding}`);
        }
      }

      if (horizontalOverflow > 2) {
        throw new Error(`Horizontal overflow detected: ${horizontalOverflow}`);
      }

      if (!(triggerCount > 0)) {
        throw new Error('No top-level sidebar items found');
      }

      if (firstLabelAfterBox && firstLabelAfterBox.labelTop <= firstLabelAfterBox.iconBottom) {
        throw new Error('Label overlaps or is not below icon box');
      }

      itemRects.forEach((r, index) => {
        if (!(r.iconW >= 40 && r.iconW <= 56 && r.iconH >= 40 && r.iconH <= 56)) {
          throw new Error(`Icon box size out of range on item ${index + 1}: ${r.iconW}x${r.iconH}`);
        }
      });

      if (scrollContainer) {
        const canScroll = scrollContainer.scrollHeight > scrollContainer.clientHeight + 2;
        const firstVisible = await page.locator('.right-sidebar-nav .sidebar-nav-item--top-level:first-child').isVisible();
        let lastVisible = await page.locator('.right-sidebar-nav .sidebar-nav-item--top-level:last-child').isVisible();
        if (!firstVisible) {
          throw new Error('First nav item is not visible');
        }
        if (!lastVisible && canScroll) {
          await page.locator('.right-sidebar-nav__scroll').evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          await page.waitForTimeout(200);
          lastVisible = await page.locator('.right-sidebar-nav .sidebar-nav-item--top-level:last-child').isVisible();
        }
        if (!lastVisible) {
          throw new Error('Last nav item not visible and not reachable by rail scroll');
        }
      }

      await page.screenshot({
        path: `artifacts/right-sidebar-verify/${viewport.name}.png`,
        fullPage: true,
      });

      console.log(JSON.stringify({
        viewport: `${viewport.w}x${viewport.h}`,
        sidebar,
        mainHasSidebarPadding,
        triggerCount,
        itemCount: itemRects.length,
        canScroll: scrollContainer ? scrollContainer.scrollHeight > scrollContainer.clientHeight + 2 : false,
        horizontalOverflow,
      }, null, 2));
    });
  }
});
