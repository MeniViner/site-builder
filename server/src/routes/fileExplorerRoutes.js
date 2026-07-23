import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { decodeFileExplorerTarget, encodeFileExplorerTarget, parseFileExplorerTarget } from '../../../src/utils/fileExplorerTargets.js';
import { contentTypes, readDirectoryModel, renderDirectoryPage, searchDirectoryModel } from '../../../scripts/dev/localFileBridge.js';
import { getFileExplorerReadiness, noteFileExplorerFilesystemError } from '../services/fileExplorerDiagnostics.js';
import { ApiError } from '../utils/errors.js';

const MESSAGES = Object.freeze({ access_denied: 'לחשבון השירות אין הרשאה לקרוא נתיב זה.', admin_only: 'אבחון כתובת Chrome זמין למפעיל מורשה בלבד.', blocked_root: 'הנתיב המבוקש אינו נמצא באחד השורשים המורשים.', explorer_disabled: 'סייר הקבצים אינו מוגדר או אינו זמין בשרת זה.', file_too_large: 'הקובץ גדול מהמגבלה המותרת להצגה או להורדה.', invalid_path: 'הנתיב המבוקש אינו תקין.', not_found: 'הקובץ או התיקייה לא נמצאו.', timeout: 'הפעולה ארכה זמן רב מדי. נסו שוב.', unavailable_share: 'שיתוף הקבצים אינו זמין כרגע.', unsupported_operation: 'פעולה זו אינה זמינה בסייר הארגוני.' });
const error = (statusCode, code) => new ApiError(statusCode, code, MESSAGES[code] || 'אירעה שגיאה בסייר הקבצים.');
const windowsPath = (target) => target.kind === 'unc' || target.kind === 'windows-drive';
const targetPathApi = (target) => windowsPath(target) ? path.win32 : path.posix;
const normalizeRealPath = (value) => String(value || '').replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/i, '');

export function isFileExplorerPathWithinRoot(target, root) {
  if (!target || !root || target.kind !== root.kind) return false;
  const separator = windowsPath(target) ? '\\' : '/';
  const normalize = windowsPath(target) ? (value) => value.toLowerCase() : (value) => value;
  const candidate = normalize(target.canonicalPath);
  const rootPath = normalize(root.canonicalPath);
  const base = rootPath.endsWith(separator) ? rootPath.slice(0, -1) : rootPath;
  return candidate === base || candidate.startsWith(`${base}${separator}`);
}
function targetFromRequest(req) { return typeof req.query.target === 'string' ? decodeFileExplorerTarget(req.query.target) : parseFileExplorerTarget(typeof req.query.path === 'string' ? req.query.path : req.query.href); }
export function mapFileExplorerSystemError(cause) {
  if (cause instanceof ApiError) return cause;
  noteFileExplorerFilesystemError(cause);
  if (['EACCES', 'EPERM'].includes(cause?.code)) return error(403, 'access_denied');
  if (cause?.code === 'ENOENT') return error(404, 'not_found');
  if (['ENETDOWN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED'].includes(cause?.code)) return error(503, 'unavailable_share');
  if (cause?.code === 'ETIMEDOUT') return error(504, 'timeout');
  return error(500, 'unavailable_share');
}
function errorHtml(cause) { return `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>סייר הקבצים</title><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:3rem"><main style="max-width:44rem;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem"><h1>סייר הקבצים הארגוני</h1><p>${cause?.message || MESSAGES.unavailable_share}</p><p style="color:#64748b">בדקו את הנתיב, את ההרשאה של חשבון השירות ואת זמינות שיתוף הקבצים.</p></main></body></html>`; }
function respondError(req, res, cause) {
  const mapped = mapFileExplorerSystemError(cause);
  const html = !req.query.search && !['/directory', '/download', '/metadata', '/readiness'].includes(req.path);
  return html ? res.status(mapped.statusCode).type('html').send(errorHtml(mapped)) : res.status(mapped.statusCode).json({ error: { code: mapped.code, message: mapped.message }, ok: false });
}
function timeout(req, res, milliseconds) {
  const timer = setTimeout(() => { if (!res.headersSent) respondError(req, res, error(504, 'timeout')); else res.destroy(); }, milliseconds);
  res.once('close', () => clearTimeout(timer));
  res.once('finish', () => clearTimeout(timer));
}
function assertTarget(req, config) {
  if (config.configurationError || !config.roots.length) throw error(503, 'explorer_disabled');
  if (String(req.query.open || '') === '1') throw error(405, 'unsupported_operation');
  const target = targetFromRequest(req);
  if (!target || target.kind === 'web') throw error(400, 'invalid_path');
  const root = config.roots.find((candidate) => isFileExplorerPathWithinRoot(target, candidate));
  if (!root) throw error(403, 'blocked_root');
  try {
    const stats = fs.statSync(target.canonicalPath);
    const realTarget = parseFileExplorerTarget(normalizeRealPath(fs.realpathSync(target.canonicalPath)));
    const realRoot = parseFileExplorerTarget(normalizeRealPath(fs.realpathSync(root.canonicalPath)));
    if (!realTarget || !realRoot || !isFileExplorerPathWithinRoot(realTarget, realRoot)) throw error(403, 'blocked_root');
    return { stats, target };
  } catch (cause) { throw mapFileExplorerSystemError(cause); }
}
function explorerHref(basePath, candidatePath, roots) {
  const target = parseFileExplorerTarget(candidatePath);
  if (!target || !roots.some((root) => isFileExplorerPathWithinRoot(target, root))) return '';
  const token = encodeFileExplorerTarget(target);
  return token ? `${basePath}?target=${token}` : '';
}
function parentPath(target) { const parent = targetPathApi(target).dirname(target.canonicalPath); return parent === target.canonicalPath ? '' : parent; }
function mapDirectory(model, target, basePath, roots) {
  const href = (candidatePath) => explorerHref(basePath, candidatePath, roots);
  return { ...model, breadcrumbs: (model.breadcrumbs || []).map((crumb) => ({ ...crumb, href: href(crumb.path) })), currentHref: href(target.canonicalPath), entries: (model.entries || []).map((entry) => ({ ...entry, href: href(entry.fullPath) })), parentHref: href(parentPath(target)) };
}
function mapSearch(model, basePath, roots) { return { ...model, results: (model.results || []).map((entry) => ({ ...entry, href: explorerHref(basePath, entry.fullPath, roots), parentHref: explorerHref(basePath, entry.parentPath, roots) })) }; }
function filename(target) { return targetPathApi(target).basename(target.canonicalPath) || 'download'; }
function stream(req, res, target, stats, { download = false, maxFileBytes }) {
  if (stats.size > maxFileBytes) throw error(413, 'file_too_large');
  const total = stats.size;
  const range = typeof req.headers.range === 'string' ? req.headers.range.match(/bytes=(\d*)-(\d*)/) : null;
  let start = 0; let end = Math.max(total - 1, 0);
  if (range) {
    start = range[1] ? Number.parseInt(range[1], 10) : 0; end = range[2] ? Number.parseInt(range[2], 10) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) { res.set('Content-Range', `bytes */${total}`); return res.status(416).end(); }
    end = Math.min(end, total - 1);
  }
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': String(total === 0 ? 0 : end - start + 1), 'Content-Type': contentTypes[path.extname(filename(target)).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(filename(target))}`;
  res.status(range ? 206 : 200).set(headers);
  if (range) res.set('Content-Range', `bytes ${start}-${end}/${total}`);
  if (!total) return res.end();
  return fs.createReadStream(target.canonicalPath, { end, start }).on('error', (cause) => { if (!res.headersSent) respondError(req, res, cause); else res.destroy(cause); }).pipe(res);
}
function jsonDirectory(model) { return { breadcrumbs: (model.breadcrumbs || []).map(({ href, label }) => ({ href, label })), currentHref: model.currentHref, entries: (model.entries || []).map(({ href, isDirectory, kind, label, modifiedIso, name, size }) => ({ href, isDirectory, kind, label, modifiedIso, name, size })), itemCount: model.itemCount, parentHref: model.parentHref }; }

export function createFileExplorerRouter({ config = {} } = {}) {
  const explorer = { configurationError: config.configurationError || null, entryLimit: config.entryLimit || 500, maxFileBytes: config.maxFileBytes || 1024 * 1024 * 1024, requestTimeoutMs: config.requestTimeoutMs || 15_000, roots: Array.isArray(config.roots) ? config.roots : [], searchDepth: config.searchDepth || 8, searchResultLimit: config.searchResultLimit || 80, searchVisitLimit: config.searchVisitLimit || 2_500 };
  const router = Router();
  router.get('/readiness', (req, res) => { const readiness = getFileExplorerReadiness({ ...config, ...explorer }, { authentication: req.fileExplorerAuth }); return res.status(readiness.ready ? 200 : 503).json({ ok: readiness.ready, readiness }); });
  router.get('/diagnostic/native-url', (req, res) => {
    try {
      if (req.fileExplorerAuth?.mode !== 'api-key') throw error(403, 'admin_only');
      const { target } = assertTarget(req, explorer);
      return res.json({ nativeChromeUrl: target.canonicalHref, ok: true });
    } catch (cause) { return respondError(req, res, cause); }
  });
  router.get('/metadata', (req, res) => { timeout(req, res, explorer.requestTimeoutMs); try { const { stats, target } = assertTarget(req, explorer); return res.json({ entry: { isDirectory: stats.isDirectory(), isFile: stats.isFile(), modifiedIso: stats.mtime.toISOString(), name: filename(target), size: stats.size }, ok: true, target: { kind: target.kind, path: target.displayPath } }); } catch (cause) { return respondError(req, res, cause); } });
  router.get('/directory', (req, res) => { timeout(req, res, explorer.requestTimeoutMs); try { const { stats, target } = assertTarget(req, explorer); if (!stats.isDirectory()) throw error(400, 'invalid_path'); const model = readDirectoryModel(target.canonicalPath); const mapped = mapDirectory({ ...model, entries: model.entries.slice(0, explorer.entryLimit) }, target, req.baseUrl || '/api/file-explorer', explorer.roots); return res.json({ directory: jsonDirectory(mapped), ok: true, truncated: model.entries.length > mapped.entries.length }); } catch (cause) { return respondError(req, res, cause); } });
  router.get('/download', (req, res) => { timeout(req, res, explorer.requestTimeoutMs); try { const { stats, target } = assertTarget(req, explorer); if (!stats.isFile()) throw error(400, 'invalid_path'); return stream(req, res, target, stats, { download: true, maxFileBytes: explorer.maxFileBytes }); } catch (cause) { return respondError(req, res, cause); } });
  router.get('/', (req, res) => {
    timeout(req, res, explorer.requestTimeoutMs);
    try {
      const { stats, target } = assertTarget(req, explorer); const basePath = req.baseUrl || '/api/file-explorer';
      if (typeof req.query.path === 'string' && typeof req.query.target !== 'string' && String(req.query.search || '') !== '1') return res.redirect(302, explorerHref(basePath, target.canonicalPath, explorer.roots));
      if (String(req.query.search || '') === '1') {
        if (!stats.isDirectory()) throw error(400, 'invalid_path');
        return res.json({ ok: true, ...mapSearch(searchDirectoryModel(target.canonicalPath, typeof req.query.q === 'string' ? req.query.q : '', process.platform, { maxDepth: explorer.searchDepth, resultLimit: explorer.searchResultLimit, visitLimit: explorer.searchVisitLimit }), basePath, explorer.roots) });
      }
      if (stats.isFile()) return stream(req, res, target, stats, { maxFileBytes: explorer.maxFileBytes });
      if (!stats.isDirectory()) throw error(400, 'invalid_path');
      const model = readDirectoryModel(target.canonicalPath); const entries = model.entries.slice(0, explorer.entryLimit); const mapped = mapDirectory({ ...model, entries, itemCount: entries.length }, target, basePath, explorer.roots);
      return res.type('html').send(renderDirectoryPage(mapped, { allowNativeOpen: false, bridgePath: basePath, hrefForPath: (candidatePath) => explorerHref(basePath, candidatePath, explorer.roots) }));
    } catch (cause) { return respondError(req, res, cause); }
  });
  return router;
}
