import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import {
  resolveSharePointAppHostingContext,
  SHAREPOINT_APP_HOSTING_CONTEXTS,
} from '../services/storage/storageBackend';

export function shouldRunBlockingSharePointSetupValidation({
  routePath,
  browserLocation = typeof window === 'undefined' ? null : window.location,
  runtimePaths = SHAREPOINT_PATHS,
  buildMode,
} = {}) {
  const normalizedRoute = String(routePath || '').replace(/\/+$/g, '');
  if (normalizedRoute === '/admin/sharepoint-setup') return true;
  return resolveSharePointAppHostingContext(browserLocation, runtimePaths, { buildMode })
    === SHAREPOINT_APP_HOSTING_CONTEXTS.BOOTSTRAP;
}

export const LEGACY_PROVISIONING_STATUSES = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
});

const markerKey = (runtimePaths) =>
  `site-builder:legacy-provisioning:${String(runtimePaths?.siteDbRoot || runtimePaths?.siteRoot || 'unknown').toLowerCase()}`;

export function readLegacyProvisioningStatus({
  runtimePaths = SHAREPOINT_PATHS,
  storage = typeof window === 'undefined' ? null : window.localStorage,
} = {}) {
  try {
    return storage?.getItem(markerKey(runtimePaths)) || '';
  } catch {
    return '';
  }
}

export function writeLegacyProvisioningStatus(status, {
  runtimePaths = SHAREPOINT_PATHS,
  storage = typeof window === 'undefined' ? null : window.localStorage,
} = {}) {
  if (!Object.values(LEGACY_PROVISIONING_STATUSES).includes(status)) {
    throw new Error(`Unsupported Legacy provisioning status: ${status}`);
  }
  storage?.setItem(markerKey(runtimePaths), status);
}

export function shouldSuppressAutomaticBackup({
  routePath,
  browserLocation = typeof window === 'undefined' ? null : window.location,
  runtimePaths = SHAREPOINT_PATHS,
  storage = typeof window === 'undefined' ? null : window.localStorage,
  buildMode,
} = {}) {
  if (shouldRunBlockingSharePointSetupValidation({ routePath, browserLocation, runtimePaths, buildMode })) {
    return true;
  }
  const status = readLegacyProvisioningStatus({ runtimePaths, storage });
  return Boolean(status && status !== LEGACY_PROVISIONING_STATUSES.COMPLETE);
}
