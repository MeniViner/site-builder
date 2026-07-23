import { buildFileExplorerHref, isFileExplorerTarget, parseFileExplorerTarget } from './fileExplorerTargets';

export const LOCAL_FILE_BRIDGE_PATH = '/__sitebuilder-local-file';

function browserLocation() { return typeof window !== 'undefined' ? window.location : null; }
export function isLocalFileBridgeEnabled() {
  const location = browserLocation();
  if (!location || !import.meta.env.DEV || import.meta.env.VITE_LOCAL_FILE_BRIDGE !== 'true') return false;
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1';
}
export function getLocalFileBridgeHref(value) {
  const target = parseFileExplorerTarget(value);
  return target && target.kind !== 'web' ? `${LOCAL_FILE_BRIDGE_PATH}?href=${encodeURIComponent(target.canonicalHref)}` : null;
}
export function isLocalFilePath(value) { return isFileExplorerTarget(value); }
export function isFileLinkTarget(value) { return isFileExplorerTarget(value); }
export function isSystemLinkTarget(value) { return isFileExplorerTarget(value) || /^afp:/i.test(typeof value === 'string' ? value.trim() : ''); }
export function normalizeLinkTarget(value) {
  const target = parseFileExplorerTarget(value);
  if (target?.kind === 'web') return target.canonicalHref;
  if (target) return buildFileExplorerHref(target);
  return typeof value === 'string' ? value.trim() : '';
}
export function getLinkTargetAttributes(value) { return { href: normalizeLinkTarget(value), rel: 'noopener noreferrer', target: '_blank' }; }
export function openLinkTarget(value) {
  const href = normalizeLinkTarget(value);
  return href && typeof window !== 'undefined' ? window.open(href, '_blank', 'noopener,noreferrer') : null;
}
