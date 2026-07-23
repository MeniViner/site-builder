import crypto from 'node:crypto';
import fs from 'node:fs';

let lastFilesystemError = null;
const rootId = (root) => crypto.createHash('sha256').update(String(root?.canonicalPath || '')).digest('hex').slice(0, 12);
const identity = () => String(process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : (process.env.USER || process.env.USERNAME || `uid:${process.getuid?.() ?? 'unknown'}`)).slice(0, 256);
export function noteFileExplorerFilesystemError(error) { lastFilesystemError = { at: new Date().toISOString(), code: String(error?.code || 'unknown').slice(0, 64) }; }
export function getFileExplorerReadiness(config = {}) {
  const roots = Array.isArray(config.roots) ? config.roots : [];
  const rootDiagnostics = roots.map((root) => {
    try { fs.readdirSync(root.canonicalPath, { withFileTypes: true }); return { accessible: true, id: rootId(root), status: 'ready' }; }
    catch (error) { noteFileExplorerFilesystemError(error); return { accessible: false, errorCode: String(error?.code || 'unknown').slice(0, 64), id: rootId(root), status: 'unavailable' }; }
  });
  const enabled = Boolean(config.configured && !config.configurationError && roots.length);
  const ready = !config.configured || (enabled && rootDiagnostics.every((root) => root.accessible));
  return { apiOrigin: config.auth?.apiOrigin || '', allowedFrontendOrigins: config.auth?.allowedOrigins || [], authenticationMode: config.auth?.mode || 'disabled', enabled, lastFilesystemError, limits: { directoryEntries: config.entryLimit || 0, fileBytes: config.maxFileBytes || 0, requestTimeoutMs: config.requestTimeoutMs || 0, searchDepth: config.searchDepth || 0, searchResults: config.searchResultLimit || 0 }, platform: process.platform, processIdentity: identity(), ready, requiresAttention: Boolean(config.configured && !ready), rootCount: roots.length, roots: rootDiagnostics };
}
