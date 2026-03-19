import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_SETTINGS, mergeWidgetSettings } from './widgetDisplay';

describe('mergeWidgetSettings', () => {
  it('merges defaults and enforces minimum limits', () => {
    const merged = mergeWidgetSettings({
      alerts: { itemsPerView: -2, intervalMs: 1000, autoScroll: false },
    });

    expect(merged.alerts.itemsPerView).toBe(1);
    expect(merged.alerts.intervalMs).toBe(2000);
    expect(merged.alerts.autoScroll).toBe(false);
    expect(merged.news).toEqual(DEFAULT_WIDGET_SETTINGS.news);
  });
});
