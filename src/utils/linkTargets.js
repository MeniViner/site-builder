import { buildFileExplorerHref, isFileExplorerTarget, parseFileExplorerTarget } from './fileExplorerTargets';

export function isLocalFilePath(value) { return isFileExplorerTarget(value); }
export function isFileLinkTarget(value) { return isFileExplorerTarget(value); }
export function isSystemLinkTarget(value) { return isFileExplorerTarget(value); }
export function normalizeLinkTarget(value) {
  const target = parseFileExplorerTarget(value);
  if (target?.kind === 'web') return target.canonicalHref;
  if (target?.kind === 'unc') return buildFileExplorerHref(target);
  if (/^(?:[a-z]:[\\/]|file:\/\/\/|afp:)/iu.test(typeof value === 'string' ? value.trim() : '')) return '';
  return typeof value === 'string' ? value.trim() : '';
}
export function getLinkTargetAttributes(value) { return { href: normalizeLinkTarget(value), rel: 'noopener noreferrer', target: '_blank' }; }
export function openLinkTarget(value) {
  const href = normalizeLinkTarget(value);
  return href && typeof window !== 'undefined' ? window.open(href, '_blank', 'noopener,noreferrer') : null;
}
