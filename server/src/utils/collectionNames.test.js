import { describe, expect, it } from 'vitest';
import { sanitizeSiteCollectionName } from './collectionNames.js';

describe('sanitizeSiteCollectionName', () => {
  it('handles slashes and spaces', () => {
    const name = sanitizeSiteCollectionName('Sites/my site/subsite');
    expect(name).toMatch(/^site_sites_my_site_subsite_[a-f0-9]{10}$/);
    expect(name).not.toContain('/');
    expect(name).not.toContain(' ');
  });

  it('handles dots and unsafe characters', () => {
    const name = sanitizeSiteCollectionName('my.site/$unsafe');
    expect(name).toMatch(/^site_my_site_unsafe_[a-f0-9]{10}$/);
    expect(name).not.toContain('.');
    expect(name).not.toContain('$');
  });

  it('handles Hebrew without trusting raw input', () => {
    const name = sanitizeSiteCollectionName('אתר בדיקה');
    expect(name).toMatch(/^site_site_[a-f0-9]{10}$/);
    expect(name).not.toContain('אתר');
  });

  it('handles very long names', () => {
    const name = sanitizeSiteCollectionName('a'.repeat(300));
    expect(name.length).toBeLessThanOrEqual(96);
    expect(name).toMatch(/_[a-f0-9]{10}$/);
  });

  it('is stable and unique for different inputs', () => {
    const one = sanitizeSiteCollectionName('alpha');
    const two = sanitizeSiteCollectionName('alpha');
    const three = sanitizeSiteCollectionName('alpha-2');
    expect(one).toBe(two);
    expect(one).not.toBe(three);
  });
});
