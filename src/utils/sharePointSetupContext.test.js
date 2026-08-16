import { describe, expect, it } from 'vitest';
import {
  LEGACY_PROVISIONING_STATUSES,
  readLegacyProvisioningStatus,
  shouldSuppressAutomaticBackup,
  writeLegacyProvisioningStatus,
} from './sharePointSetupContext';

const runtimePaths = {
  host: 'portal.army.idf',
  siteRoot: '/sites/schedule',
  siteDbRoot: '/sites/schedule/siteDB1436',
  targetDistPath: '/sites/schedule/siteDB1436/dist',
  bootstrapLibrary: 'SiteAssets',
  bootstrapFolder: 'sitebuilder-bootstrap',
};

const locationAt = (pathname) => ({
  host: 'portal.army.idf',
  hostname: 'portal.army.idf',
  origin: 'https://portal.army.idf',
  pathname,
});

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

describe('automatic backup isolation during Legacy provisioning', () => {
  it('suppresses automatic backup when physically hosted under Bootstrap', () => {
    expect(shouldSuppressAutomaticBackup({
      routePath: '/',
      browserLocation: locationAt('/sites/schedule/SiteAssets/sitebuilder-bootstrap/dist/index.html'),
      runtimePaths,
      buildMode: 'legacy',
      storage: memoryStorage(),
    })).toBe(true);
  });

  it('suppresses automatic backup on the explicit setup route', () => {
    expect(shouldSuppressAutomaticBackup({
      routePath: '/admin/sharepoint-setup',
      browserLocation: locationAt('/sites/schedule/siteDB1436/dist/index.html'),
      runtimePaths,
      buildMode: 'legacy',
      storage: memoryStorage(),
    })).toBe(true);
  });

  it('suppresses automatic backup after partial provisioning until COMPLETE', () => {
    const storage = memoryStorage();
    writeLegacyProvisioningStatus(LEGACY_PROVISIONING_STATUSES.IN_PROGRESS, { runtimePaths, storage });
    expect(readLegacyProvisioningStatus({ runtimePaths, storage })).toBe(LEGACY_PROVISIONING_STATUSES.IN_PROGRESS);
    expect(shouldSuppressAutomaticBackup({
      routePath: '/',
      browserLocation: locationAt('/sites/schedule/siteDB1436/dist/index.html'),
      runtimePaths,
      buildMode: 'legacy',
      storage,
    })).toBe(true);
  });

  it('retains automatic backup for a final initialized app', () => {
    const storage = memoryStorage();
    writeLegacyProvisioningStatus(LEGACY_PROVISIONING_STATUSES.COMPLETE, { runtimePaths, storage });
    expect(shouldSuppressAutomaticBackup({
      routePath: '/',
      browserLocation: locationAt('/sites/schedule/siteDB1436/dist/index.html'),
      runtimePaths,
      buildMode: 'legacy',
      storage,
    })).toBe(false);
  });

  it('does not treat an existing empty Backups artifact as provisioning completion', () => {
    const storage = memoryStorage({ Backups: 'backup-old-empty' });
    writeLegacyProvisioningStatus(LEGACY_PROVISIONING_STATUSES.IN_PROGRESS, { runtimePaths, storage });
    expect(shouldSuppressAutomaticBackup({
      routePath: '/',
      browserLocation: locationAt('/sites/schedule/siteDB1436/dist/index.html'),
      runtimePaths,
      buildMode: 'legacy',
      storage,
    })).toBe(true);
  });
});
