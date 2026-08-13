import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import {
  resolveSharePointAppHostingContext,
  SHAREPOINT_APP_HOSTING_CONTEXTS,
} from '../services/storage/storageBackend';

export function shouldRunBlockingSharePointSetupValidation({
  routePath,
  browserLocation = typeof window === 'undefined' ? null : window.location,
  runtimePaths = SHAREPOINT_PATHS,
} = {}) {
  const normalizedRoute = String(routePath || '').replace(/\/+$/g, '');
  if (normalizedRoute === '/admin/sharepoint-setup') return true;
  return resolveSharePointAppHostingContext(browserLocation, runtimePaths)
    === SHAREPOINT_APP_HOSTING_CONTEXTS.BOOTSTRAP;
}
