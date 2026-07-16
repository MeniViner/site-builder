import { describe, expect, it } from 'vitest';
import { canAccessAdminUi } from './adminAccess';

describe('canAccessAdminUi', () => {
  it('always exposes admin controls during local development', () => {
    expect(canAccessAdminUi({
      isAdmin: false,
      loading: true,
      isDevelopment: true,
    })).toBe(true);
  });

  it('keeps production admin controls permission-gated', () => {
    expect(canAccessAdminUi({ isAdmin: false, loading: false, isDevelopment: false })).toBe(false);
    expect(canAccessAdminUi({ isAdmin: true, loading: true, isDevelopment: false })).toBe(false);
    expect(canAccessAdminUi({ isAdmin: true, loading: false, isDevelopment: false })).toBe(true);
  });

  it('never exposes admin controls inside a site preview', () => {
    expect(canAccessAdminUi({ isPreview: true, isDevelopment: true })).toBe(false);
  });
});
