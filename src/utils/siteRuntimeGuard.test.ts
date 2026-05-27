import { describe, expect, it } from 'vitest';
import {
  buildExpectedSharePointSiteRoot,
  isAllowedSharePointRuntimeLocation,
  normalizeUrlForSiteCheck,
} from './siteRuntimeGuard';

const env = {
  VITE_SP_HOST: 'portal.army.idf',
  VITE_SP_SITE_CODE: 'schedule',
};

const runtimeLocation = (value: string) => new URL(value) as unknown as Location;

describe('site runtime guard', () => {
  it('allows the intended SharePoint site', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html#/admin'),
      env
    )).toBe(true);
  });

  it('blocks a copied site under another SharePoint site code', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://portal.army.idf/sites/other/siteDB/dist/index.html#/admin'),
      env
    )).toBe(false);
  });

  it('blocks the right site path on the wrong host', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://other.host/sites/schedule/siteDB/dist/index.html'),
      env
    )).toBe(false);
  });

  it('allows localhost', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('http://localhost:5173/#/admin'),
      env
    )).toBe(true);
  });

  it('allows 127.0.0.1', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('http://127.0.0.1:5173/#/admin'),
      env
    )).toBe(true);
  });

  it('allows Vite preview locations', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('http://192.168.1.10:4173/#/admin'),
      env
    )).toBe(true);
  });

  it('allows missing env values', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://other.host/sites/copied/siteDB/dist/index.html'),
      { VITE_SP_HOST: '', VITE_SP_SITE_CODE: 'schedule' }
    )).toBe(true);
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://other.host/sites/copied/siteDB/dist/index.html'),
      { VITE_SP_HOST: 'portal.army.idf', VITE_SP_SITE_CODE: '' }
    )).toBe(true);
  });

  it('ignores query strings and hash routes', () => {
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html?x=1#/admin/deep'),
      env
    )).toBe(true);
  });

  it('handles trailing slashes on the expected root and current path', () => {
    expect(buildExpectedSharePointSiteRoot('portal.army.idf/', '/schedule/')).toBe(
      'https://portal.army.idf/sites/schedule/'
    );
    expect(isAllowedSharePointRuntimeLocation(
      runtimeLocation('https://portal.army.idf/sites/schedule'),
      env
    )).toBe(true);
    expect(normalizeUrlForSiteCheck('https://PORTAL.ARMY.IDF//sites//Schedule///')).toBe(
      'https://portal.army.idf/sites/schedule/'
    );
  });
});
