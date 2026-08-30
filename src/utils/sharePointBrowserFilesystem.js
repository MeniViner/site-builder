const DEFAULT_RETRY_DELAYS_MS = Object.freeze([0, 150, 350, 700, 1200, 2000, 3500, 5000]);

const text = (value) => String(value ?? '').trim();
const sleepDefault = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const escOData = (value) => text(value)
  .replace(/'/g, "''")
  .replace(/%/g, '%25')
  .replace(/#/g, '%23')
  .replace(/\?/g, '%3F');

export class SharePointBrowserFilesystemError extends Error {
  constructor(code, message, details = {}, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SharePointBrowserFilesystemError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function normalizeSharePointPath(value) {
  const raw = text(value);
  if (!raw) return '';
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return '';
    }
  }
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep raw percent characters when the value is already a decoded path.
  }
  const normalized = `/${pathname.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  return normalized === '/' ? '' : normalized.normalize('NFC');
}

export function sameSharePointPath(left, right) {
  const a = normalizeSharePointPath(left);
  const b = normalizeSharePointPath(right);
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function toWebRelativeSharePointPath(serverRelativePath, siteRoot) {
  const path = normalizeSharePointPath(serverRelativePath);
  const root = normalizeSharePointPath(siteRoot);
  if (!path || !root) return '';
  if (path.toLowerCase() === root.toLowerCase()) return '';
  const prefix = `${root}/`;
  if (!path.toLowerCase().startsWith(prefix.toLowerCase())) return '';
  return path.slice(prefix.length);
}

export function unwrapSharePointODataRecord(payload) {
  const value = payload?.d ?? payload?.value ?? payload;
  if (Array.isArray(value)) return value.length === 1 && value[0] && typeof value[0] === 'object' ? value[0] : null;
  return value && typeof value === 'object' ? value : null;
}

async function readResponseBody(response) {
  const raw = await response.text().catch(() => '');
  if (!raw) return { raw: '', parsed: null };
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    return { raw, parsed: null };
  }
}

function responseMessage(payload, raw = '') {
  const record = payload && typeof payload === 'object' ? payload : {};
  const candidate = record?.error?.message ?? record?.['odata.error']?.message;
  const message = typeof candidate === 'string' ? candidate : candidate?.value;
  return text(message || raw);
}

export function isSharePointDirectoryNotReady({ status, payload, raw = '' } = {}) {
  const message = responseMessage(payload, raw);
  return Number(status) === 404
    || (Number(status) === 409 && /directory|folder|path|exist|conflict/i.test(message))
    || /DirectoryNotFoundException|cannot find part of the path|folder.*not found|path.*not found/i.test(message);
}

export function isSharePointFileMissingResponse({ status, payload, raw = '' } = {}) {
  const numericStatus = Number(status || 0);
  const message = responseMessage(payload, raw);
  return numericStatus === 404
    || (numericStatus === 400 && /FileNotFoundException|file\s+not\s+found|cannot find the file|does not exist|not found/i.test(message));
}

function normalizeLibraries(libraries = []) {
  return libraries
    .map((library) => ({ title: text(library?.title), rootRel: normalizeSharePointPath(library?.rootRel) }))
    .filter((library) => library.title && library.rootRel)
    .sort((left, right) => right.rootRel.length - left.rootRel.length);
}

function findOwningLibrary(folderRel, libraries = []) {
  const folder = normalizeSharePointPath(folderRel);
  return normalizeLibraries(libraries).find((library) => (
    sameSharePointPath(folder, library.rootRel)
    || folder.toLowerCase().startsWith(`${library.rootRel.toLowerCase()}/`)
  )) || null;
}

function buildListEndpoint(webUrl, title) {
  return `${webUrl}/_api/web/lists/GetByTitle('${escOData(title)}')?$select=Id,Title,BaseTemplate,RootFolder/ServerRelativeUrl&$expand=RootFolder`;
}

function buildFolderListItemEndpoint(webUrl, folderRel) {
  return `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(folderRel)}')/ListItemAllFields?$select=Id,FileSystemObjectType,FileRef,Folder/ServerRelativeUrl&$expand=Folder`;
}

function buildFolderEndpoint(webUrl, folderRel) {
  return `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(folderRel)}')?$select=ServerRelativeUrl,Name,Exists`;
}

export function classifySharePointFolderProbe({ status, payload, expectedPath, libraryRoot = false } = {}) {
  const numericStatus = Number(status || 0);
  const expected = normalizeSharePointPath(expectedPath);
  if (numericStatus === 404) {
    return Object.freeze({ ready: false, exists: false, reason: 'FOLDER_NOT_FOUND', expectedPath: expected, actualPath: '', status: numericStatus });
  }
  if (numericStatus < 200 || numericStatus >= 300) {
    return Object.freeze({ ready: false, exists: false, reason: 'FOLDER_PROBE_FAILED', expectedPath: expected, actualPath: '', status: numericStatus });
  }

  const record = unwrapSharePointODataRecord(payload);
  if (!record) {
    return Object.freeze({ ready: false, exists: true, reason: 'FOLDER_METADATA_UNRECOGNIZED', expectedPath: expected, actualPath: '', status: numericStatus });
  }

  if (libraryRoot) {
    const actualPath = normalizeSharePointPath(record?.RootFolder?.ServerRelativeUrl);
    const baseTemplate = Number(record?.BaseTemplate);
    const id = text(record?.Id);
    const ready = Boolean(id && baseTemplate === 101 && sameSharePointPath(actualPath, expected));
    return Object.freeze({ ready, exists: Boolean(id), reason: ready ? 'LIBRARY_ROOT_READY' : 'LIBRARY_ROOT_NOT_READY', expectedPath: expected, actualPath, status: numericStatus, id, baseTemplate: Number.isFinite(baseTemplate) ? baseTemplate : null });
  }

  const id = Number(record?.Id);
  const objectType = Number(record?.FileSystemObjectType);
  const actualPath = normalizeSharePointPath(record?.FileRef ?? record?.Folder?.ServerRelativeUrl ?? record?.ServerRelativeUrl);
  const hasListItemIdentity = Number.isFinite(id) && id > 0;
  const hasFolderType = objectType === 1 || (!Number.isFinite(objectType) && Boolean(actualPath));
  const ready = hasListItemIdentity && hasFolderType && sameSharePointPath(actualPath, expected);
  return Object.freeze({
    ready,
    exists: hasListItemIdentity || Boolean(actualPath),
    reason: ready ? 'LIST_BACKED_FOLDER_READY' : 'LIST_BACKED_FOLDER_NOT_READY',
    expectedPath: expected,
    actualPath,
    status: numericStatus,
    id: hasListItemIdentity ? id : null,
    fileSystemObjectType: Number.isFinite(objectType) ? objectType : null,
  });
}

async function requestProbe({ url, expectedPath, libraryRoot, request, purpose }) {
  const response = await request({
    url,
    method: 'GET',
    purpose,
    headers: { Accept: 'application/json;odata=verbose' },
  });
  const { raw, parsed } = await readResponseBody(response);
  const result = classifySharePointFolderProbe({ status: response.status, payload: parsed, expectedPath, libraryRoot });
  return { response, raw, parsed, result };
}

export async function probeSharePointFolder({ webUrl, folderRel, libraries, request, purpose = 'folder-probe' } = {}) {
  const normalized = normalizeSharePointPath(folderRel);
  const owner = findOwningLibrary(normalized, libraries);
  if (!owner) {
    throw new SharePointBrowserFilesystemError('FOLDER_OUTSIDE_CONFIGURED_LIBRARIES', `Folder "${normalized}" is outside the configured SharePoint libraries.`, { folderRel: normalized, libraries: normalizeLibraries(libraries) });
  }

  const isLibraryRoot = sameSharePointPath(normalized, owner.rootRel);
  if (isLibraryRoot) {
    const url = buildListEndpoint(webUrl, owner.title);
    const { raw, result } = await requestProbe({ url, expectedPath: normalized, libraryRoot: true, request, purpose: `${purpose}-${normalized}` });
    return Object.freeze({ ...result, url, rawPreview: raw.slice(0, 700), owner });
  }

  const listItemUrl = buildFolderListItemEndpoint(webUrl, normalized);
  const first = await requestProbe({ url: listItemUrl, expectedPath: normalized, libraryRoot: false, request, purpose: `${purpose}-list-item-${normalized}` });
  if (first.result.ready || first.response.status === 401 || first.response.status === 403) {
    return Object.freeze({ ...first.result, url: listItemUrl, rawPreview: first.raw.slice(0, 700), owner });
  }

  // Old SharePoint builds can temporarily expose the folder object before its
  // ListItemAllFields metadata is queryable. The exact ServerRelativeUrl is a
  // useful secondary signal, but only the polling barrier below is allowed to
  // treat it as eventually ready.
  if (first.response.status === 200 || first.response.status === 404) {
    const folderUrl = buildFolderEndpoint(webUrl, normalized);
    const second = await requestProbe({ url: folderUrl, expectedPath: normalized, libraryRoot: false, request, purpose: `${purpose}-folder-object-${normalized}` });
    const record = unwrapSharePointODataRecord(second.parsed);
    const actualPath = normalizeSharePointPath(record?.ServerRelativeUrl);
    const exactFolderObject = second.response.ok && sameSharePointPath(actualPath, normalized);
    return Object.freeze({
      ...first.result,
      exists: first.result.exists || exactFolderObject,
      reason: exactFolderObject ? 'FOLDER_OBJECT_VISIBLE_WAITING_FOR_LIST_ITEM' : first.result.reason,
      actualPath: exactFolderObject ? actualPath : first.result.actualPath,
      url: listItemUrl,
      fallbackUrl: folderUrl,
      rawPreview: (second.raw || first.raw).slice(0, 700),
      owner,
    });
  }

  return Object.freeze({ ...first.result, url: listItemUrl, rawPreview: first.raw.slice(0, 700), owner });
}

export async function waitForSharePointFolder({ webUrl, folderRel, libraries, request, log = () => {}, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleep = sleepDefault, purpose = 'folder-readiness' } = {}) {
  let lastProbe = null;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    const delay = Number(retryDelaysMs[attempt] || 0);
    if (delay > 0) await sleep(delay);
    lastProbe = await probeSharePointFolder({ webUrl, folderRel, libraries, request, purpose });
    log(`folder readiness | path=${normalizeSharePointPath(folderRel)} | attempt=${attempt + 1}/${retryDelaysMs.length} | ready=${lastProbe.ready} | exists=${lastProbe.exists} | reason=${lastProbe.reason}`);
    if (lastProbe.ready) return lastProbe;
    if (lastProbe.status === 401 || lastProbe.status === 403) break;
  }
  throw new SharePointBrowserFilesystemError('FOLDER_NOT_READY', `SharePoint folder "${normalizeSharePointPath(folderRel)}" did not become list-backed and writable.`, { folderRel: normalizeSharePointPath(folderRel), lastProbe });
}

function parentSharePointPath(value) {
  const normalized = normalizeSharePointPath(value);
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : '';
}

function leafSharePointPath(value) {
  return normalizeSharePointPath(value).split('/').filter(Boolean).pop() || '';
}

async function tryCreateFolder({ webUrl, parentRel, childRel, digest, request, purpose, log }) {
  const leaf = leafSharePointPath(childRel);
  const candidates = [
    {
      url: `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(parentRel)}')/Folders/add('${escOData(leaf)}')`,
      body: undefined,
    },
    {
      url: `${webUrl}/_api/web/folders`,
      body: JSON.stringify({ __metadata: { type: 'SP.Folder' }, ServerRelativeUrl: childRel }),
    },
  ];
  let last = null;
  for (const candidate of candidates) {
    const response = await request({
      url: candidate.url,
      method: 'POST',
      purpose,
      headers: {
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest,
      },
      body: candidate.body,
    });
    const { raw, parsed } = await readResponseBody(response);
    const accepted = response.ok || response.status === 409 || /already exists/i.test(responseMessage(parsed, raw));
    log(`folder create transport | child=${childRel} | parent=${parentRel} | status=${response.status} | accepted=${accepted} | endpoint=${candidate.url}`);
    if (accepted) return { accepted: true, response, raw, parsed, url: candidate.url };
    const retryable = isSharePointDirectoryNotReady({ status: response.status, payload: parsed, raw }) || response.status === 405;
    last = { accepted: false, response, raw, parsed, url: candidate.url, retryable };
    if (!retryable) return last;
  }
  return last;
}

export async function ensureSharePointFolder({ webUrl, folderRel, siteRoot, libraries, digest, request, log = () => {}, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleep = sleepDefault } = {}) {
  const normalized = normalizeSharePointPath(folderRel);
  const owner = findOwningLibrary(normalized, libraries);
  if (!owner) {
    throw new SharePointBrowserFilesystemError('FOLDER_OUTSIDE_CONFIGURED_LIBRARIES', `Cannot create folder "${normalized}" outside configured libraries.`, { folderRel: normalized });
  }

  if (sameSharePointPath(normalized, owner.rootRel)) {
    const ready = await waitForSharePointFolder({ webUrl, folderRel: normalized, libraries, request, log, retryDelaysMs, sleep, purpose: 'library-root-readiness' });
    return Object.freeze({ existed: true, created: false, path: normalized, probe: ready });
  }

  const firstProbe = await probeSharePointFolder({ webUrl, folderRel: normalized, libraries, request, purpose: 'folder-exists' });
  if (firstProbe.ready) return Object.freeze({ existed: true, created: false, path: normalized, probe: firstProbe });

  const parent = parentSharePointPath(normalized);
  await ensureSharePointFolder({ webUrl, folderRel: parent, siteRoot, libraries, digest, request, log, retryDelaysMs, sleep });

  let lastFailure = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(retryDelaysMs[Math.min(attempt + 1, retryDelaysMs.length - 1)] || 500);
    const creation = await tryCreateFolder({
      webUrl,
      parentRel: parent,
      childRel: normalized,
      digest,
      request,
      purpose: `create-folder-${normalized}-attempt-${attempt + 1}`,
      log,
    });
    if (creation && !creation.accepted && !creation.retryable) {
      throw new SharePointBrowserFilesystemError('FOLDER_CREATE_FAILED', `SharePoint rejected folder creation for "${normalized}" with HTTP ${creation.response.status}.`, { folderRel: normalized, status: creation.response.status, responsePreview: creation.raw.slice(0, 700), url: creation.url });
    }
    try {
      const ready = await waitForSharePointFolder({ webUrl, folderRel: normalized, libraries, request, log, retryDelaysMs, sleep, purpose: 'verify-created-folder' });
      return Object.freeze({ existed: Boolean(firstProbe.exists), created: !firstProbe.ready, path: normalized, probe: ready });
    } catch (error) {
      lastFailure = error;
      await waitForSharePointFolder({ webUrl, folderRel: parent, libraries, request, log, retryDelaysMs, sleep, purpose: 'reverify-parent' });
    }
  }

  throw new SharePointBrowserFilesystemError('FOLDER_CREATE_VERIFY_FAILED', `SharePoint did not expose a writable list-backed folder at "${normalized}" after creation.`, { folderRel: normalized, cause: lastFailure?.message || '' }, lastFailure);
}

function fileValueCandidates(webUrl, fileRel, siteRoot, cacheKey = '') {
  const normalized = normalizeSharePointPath(fileRel);
  const webRelative = toWebRelativeSharePointPath(normalized, siteRoot);
  const query = cacheKey ? `?siteBuilderBuild=${encodeURIComponent(cacheKey)}` : '';
  const candidates = [normalized, webRelative].filter(Boolean).map((candidate) => `${webUrl}/_api/web/GetFileByServerRelativeUrl('${escOData(candidate)}')/$value${query}`);
  return [...new Set(candidates)];
}

export async function readSharePointFileBytes({ webUrl, fileRel, siteRoot, request, purpose = 'read-file', cacheKey = '' } = {}) {
  const attempts = [];
  for (const url of fileValueCandidates(webUrl, fileRel, siteRoot, cacheKey)) {
    const response = await request({ url, method: 'GET', purpose: `${purpose}-${normalizeSharePointPath(fileRel)}` });
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      return Object.freeze({ exists: true, bytes, status: response.status, url, attempts });
    }
    const { raw, parsed } = await readResponseBody(response);
    attempts.push({ url, status: response.status, responsePreview: raw.slice(0, 500) });
    if (isSharePointFileMissingResponse({ status: response.status, payload: parsed, raw })
      || isSharePointDirectoryNotReady({ status: response.status, payload: parsed, raw })) continue;
    throw new SharePointBrowserFilesystemError('FILE_READ_FAILED', `SharePoint file read failed for "${normalizeSharePointPath(fileRel)}" with HTTP ${response.status}.`, { fileRel: normalizeSharePointPath(fileRel), url, status: response.status, responsePreview: raw.slice(0, 700) });
  }
  return Object.freeze({ exists: false, bytes: null, status: 404, url: '', attempts });
}

function uploadCandidates({ webUrl, siteRoot, folderRel, fileName, owner }) {
  const normalizedFolder = normalizeSharePointPath(folderRel);
  const webRelative = toWebRelativeSharePointPath(normalizedFolder, siteRoot);
  const encodedName = encodeURIComponent(text(fileName)).replace(/'/g, '%27');
  const suffix = `/Files/Add(overwrite=true,url='${encodedName}')`;
  const candidates = [];
  if (sameSharePointPath(normalizedFolder, owner?.rootRel)) {
    candidates.push(`${webUrl}/_api/web/lists/GetByTitle('${escOData(owner.title)}')/RootFolder${suffix}`);
  }
  candidates.push(`${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(normalizedFolder)}')${suffix}`);
  if (webRelative) candidates.push(`${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(webRelative)}')${suffix}`);
  return [...new Set(candidates)];
}

export async function uploadSharePointFileBytes({ webUrl, folderRel, fileName, bytes, siteRoot, libraries, digest, request, log = () => {}, contentType = 'application/octet-stream', retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleep = sleepDefault } = {}) {
  const normalizedFolder = normalizeSharePointPath(folderRel);
  const owner = findOwningLibrary(normalizedFolder, libraries);
  if (!owner) {
    throw new SharePointBrowserFilesystemError('UPLOAD_OUTSIDE_CONFIGURED_LIBRARIES', `Upload folder "${normalizedFolder}" is outside configured libraries.`, { folderRel: normalizedFolder });
  }

  let lastFailure = null;
  for (let cycle = 0; cycle < 4; cycle += 1) {
    await ensureSharePointFolder({ webUrl, folderRel: normalizedFolder, siteRoot, libraries, digest, request, log, retryDelaysMs, sleep });
    const candidates = uploadCandidates({ webUrl, siteRoot, folderRel: normalizedFolder, fileName, owner });
    for (const url of candidates) {
      const response = await request({
        url,
        method: 'POST',
        purpose: `upload-${normalizeSharePointPath(`${normalizedFolder}/${fileName}`)}-cycle-${cycle + 1}`,
        headers: {
          Accept: 'application/json;odata=verbose',
          'Content-Type': contentType,
          'X-RequestDigest': digest,
        },
        body: bytes,
      });
      const { raw, parsed } = await readResponseBody(response);
      log(`file upload | folder=${normalizedFolder} | file=${fileName} | cycle=${cycle + 1}/4 | status=${response.status} | endpoint=${url}`);
      if (response.ok) return Object.freeze({ status: response.status, url, cycle: cycle + 1 });
      const retryable = isSharePointDirectoryNotReady({ status: response.status, payload: parsed, raw });
      lastFailure = { status: response.status, url, responsePreview: raw.slice(0, 700), retryable };
      if (!retryable) {
        throw new SharePointBrowserFilesystemError('FILE_UPLOAD_FAILED', `SharePoint rejected upload of "${fileName}" with HTTP ${response.status}.`, { folderRel: normalizedFolder, fileName, ...lastFailure });
      }
    }
    await sleep(retryDelaysMs[Math.min(cycle + 3, retryDelaysMs.length - 1)] || 1000);
  }

  throw new SharePointBrowserFilesystemError('FILE_UPLOAD_FOLDER_NOT_READY', `SharePoint could not upload "${fileName}" because folder "${normalizedFolder}" never became writable.`, { folderRel: normalizedFolder, fileName, lastFailure });
}

export { DEFAULT_RETRY_DELAYS_MS as SHAREPOINT_BROWSER_RETRY_DELAYS_MS };
