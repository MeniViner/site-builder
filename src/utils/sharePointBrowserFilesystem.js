import {
  EXACT_LIBRARY_ERRORS,
  ensureSharePointJsom,
} from './sharePointExactLibraryProvisioning';

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
      pathname = decodeURIComponent(new URL(raw).pathname);
    } catch {
      return '';
    }
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
  if (Array.isArray(value?.results)) {
    return value.results.length === 1 && value.results[0] && typeof value.results[0] === 'object'
      ? value.results[0]
      : null;
  }
  return value && typeof value === 'object' ? value : null;
}

export function unwrapSharePointODataCollection(payload) {
  const value = payload?.d?.results ?? payload?.value ?? payload?.d ?? payload;
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
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
    .map((library) => ({
      id: text(library?.id || library?.listId),
      title: text(library?.title),
      rootRel: normalizeSharePointPath(library?.rootRel),
    }))
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
  return `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(folderRel)}')/ListItemAllFields`
    + '?$select=Id,FileSystemObjectType,FileRef,FileDirRef,ContentTypeId,ParentList/Id,ParentList/Title,ParentList/RootFolder/ServerRelativeUrl,Folder/ServerRelativeUrl'
    + '&$expand=ParentList,ParentList/RootFolder,Folder';
}

function buildFolderEndpoint(webUrl, folderRel) {
  return `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(folderRel)}')?$select=ServerRelativeUrl,Name,Exists,ItemCount`;
}

function buildParentEnumerationEndpoint(webUrl, parentRel, childRel) {
  const leaf = leafSharePointPath(childRel);
  return `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(parentRel)}')/Folders`
    + '?$select=Name,ServerRelativeUrl,Exists,ListItemAllFields/Id,ListItemAllFields/FileSystemObjectType,ListItemAllFields/FileRef,ListItemAllFields/FileDirRef'
    + `&$expand=ListItemAllFields&$filter=Name eq '${escOData(leaf)}'&$top=2`;
}

export function classifySharePointFolderProbe({
  status,
  payload,
  expectedPath,
  libraryRoot = false,
  probeKind = libraryRoot ? 'library-root' : 'list-item',
} = {}) {
  const numericStatus = Number(status || 0);
  const expected = normalizeSharePointPath(expectedPath);
  if (numericStatus === 401 || numericStatus === 403) {
    return Object.freeze({
      ready: false,
      exists: false,
      reason: 'FOLDER_PROBE_AUTHORIZATION_FAILED',
      expectedPath: expected,
      actualPath: '',
      status: numericStatus,
    });
  }
  if (numericStatus === 404) {
    return Object.freeze({ ready: false, exists: false, reason: 'FOLDER_NOT_FOUND', expectedPath: expected, actualPath: '', status: numericStatus });
  }
  if (numericStatus < 200 || numericStatus >= 300) {
    return Object.freeze({ ready: false, exists: false, reason: 'FOLDER_PROBE_FAILED', expectedPath: expected, actualPath: '', status: numericStatus });
  }

  const record = unwrapSharePointODataRecord(payload);
  if (!record) {
    return Object.freeze({ ready: false, exists: false, reason: 'FOLDER_METADATA_UNRECOGNIZED', expectedPath: expected, actualPath: '', status: numericStatus });
  }

  if (libraryRoot) {
    const actualPath = normalizeSharePointPath(record?.RootFolder?.ServerRelativeUrl);
    const baseTemplate = Number(record?.BaseTemplate);
    const id = text(record?.Id);
    const exists = Boolean(id || actualPath || text(record?.Title));
    let reason = 'LIBRARY_ROOT_READY';
    if (!id) reason = 'LIBRARY_ID_UNCONFIRMED';
    else if (baseTemplate !== 101) reason = 'LIBRARY_NOT_DOCUMENT_LIBRARY';
    else if (!sameSharePointPath(actualPath, expected)) reason = 'LIBRARY_ROOT_PATH_MISMATCH';
    const ready = reason === 'LIBRARY_ROOT_READY';
    return Object.freeze({ ready, exists, reason, expectedPath: expected, actualPath, status: numericStatus, id, baseTemplate: Number.isFinite(baseTemplate) ? baseTemplate : null });
  }

  const explicitlyMissing = record?.Exists === false;
  const id = Number(record?.Id);
  const objectType = Number(record?.FileSystemObjectType);
  const actualPath = normalizeSharePointPath(record?.FileRef ?? record?.Folder?.ServerRelativeUrl ?? record?.ServerRelativeUrl);
  const hasListItemIdentity = Number.isFinite(id) && id > 0;
  const exists = explicitlyMissing
    ? false
    : Boolean(hasListItemIdentity || record?.Exists === true || actualPath);
  let reason = 'LIST_BACKED_FOLDER_READY';
  if (explicitlyMissing) reason = 'FOLDER_NOT_FOUND';
  else if (!actualPath) reason = 'FOLDER_METADATA_UNRECOGNIZED';
  else if (!sameSharePointPath(actualPath, expected)) reason = 'FOLDER_PATH_MISMATCH';
  else if (probeKind === 'folder-object' && !hasListItemIdentity) reason = 'FOLDER_OBJECT_VISIBLE_WAITING_FOR_LIST_ITEM';
  else if (!hasListItemIdentity) reason = 'FOLDER_LIST_ITEM_ID_UNCONFIRMED';
  else if (!Number.isFinite(objectType)) reason = 'FOLDER_OBJECT_TYPE_UNCONFIRMED';
  else if (objectType !== 1) reason = 'FOLDER_NAME_COLLISION';
  const ready = reason === 'LIST_BACKED_FOLDER_READY';
  return Object.freeze({
    ready,
    exists,
    reason,
    expectedPath: expected,
    actualPath,
    status: numericStatus,
    id: hasListItemIdentity ? id : null,
    fileSystemObjectType: Number.isFinite(objectType) ? objectType : null,
    parentPath: normalizeSharePointPath(record?.FileDirRef),
    ownerListId: text(record?.ParentList?.Id),
    ownerListTitle: text(record?.ParentList?.Title),
    ownerLibraryRoot: normalizeSharePointPath(record?.ParentList?.RootFolder?.ServerRelativeUrl),
    contentTypeId: text(record?.ContentTypeId?.StringValue ?? record?.ContentTypeId),
  });
}

async function requestProbe({ url, expectedPath, libraryRoot, probeKind, request, purpose }) {
  const response = await request({
    url,
    method: 'GET',
    purpose,
    headers: { Accept: 'application/json;odata=verbose' },
  });
  const { raw, parsed } = await readResponseBody(response);
  const result = classifySharePointFolderProbe({
    status: response.status,
    payload: parsed,
    expectedPath,
    libraryRoot,
    probeKind,
  });
  return { response, raw, parsed, result };
}

export async function probeSharePointFolder({ webUrl, folderRel, libraries, request, purpose = 'folder-probe' } = {}) {
  const normalized = normalizeSharePointPath(folderRel);
  const owner = findOwningLibrary(normalized, libraries);
  if (!owner) {
    throw new SharePointBrowserFilesystemError('FOLDER_OUTSIDE_CONFIGURED_LIBRARIES', `Folder "${normalized}" is outside the configured SharePoint libraries.`, { folderRel: normalized, libraries: normalizeLibraries(libraries) });
  }

  const isLibraryRoot = sameSharePointPath(normalized, owner.rootRel);
  const libraryUrl = buildListEndpoint(webUrl, owner.title);
  const libraryProbe = await requestProbe({
    url: libraryUrl,
    expectedPath: owner.rootRel,
    libraryRoot: true,
    probeKind: 'library-root',
    request,
    purpose: `${purpose}-owner-library-${owner.title}`,
  });
  if (!libraryProbe.result.ready) {
    return Object.freeze({
      ...libraryProbe.result,
      reason: libraryProbe.result.reason === 'FOLDER_PROBE_AUTHORIZATION_FAILED'
        ? libraryProbe.result.reason
        : `OWNER_${libraryProbe.result.reason}`,
      url: libraryUrl,
      rawPreview: libraryProbe.raw.slice(0, 700),
      owner,
    });
  }
  if (owner.id && text(libraryProbe.result.id).toLowerCase() !== owner.id.toLowerCase()) {
    return Object.freeze({
      ready: false,
      exists: true,
      reason: 'FOLDER_OWNER_LIBRARY_MISMATCH',
      expectedPath: normalized,
      actualPath: owner.rootRel,
      status: libraryProbe.response.status,
      id: libraryProbe.result.id,
      expectedOwnerListId: owner.id,
      owner,
      url: libraryUrl,
    });
  }
  if (isLibraryRoot) {
    return Object.freeze({
      ...libraryProbe.result,
      url: libraryUrl,
      rawPreview: libraryProbe.raw.slice(0, 700),
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }

  const listItemUrl = buildFolderListItemEndpoint(webUrl, normalized);
  const first = await requestProbe({
    url: listItemUrl,
    expectedPath: normalized,
    libraryRoot: false,
    probeKind: 'list-item',
    request,
    purpose: `${purpose}-list-item-${normalized}`,
  });
  if (first.result.reason === 'FOLDER_PROBE_AUTHORIZATION_FAILED') {
    return Object.freeze({ ...first.result, url: listItemUrl, rawPreview: first.raw.slice(0, 700), owner });
  }

  const folderUrl = buildFolderEndpoint(webUrl, normalized);
  const second = await requestProbe({
    url: folderUrl,
    expectedPath: normalized,
    libraryRoot: false,
    probeKind: 'folder-object',
    request,
    purpose: `${purpose}-folder-object-${normalized}`,
  });
  if (second.result.reason === 'FOLDER_PROBE_AUTHORIZATION_FAILED') {
    return Object.freeze({
      ...second.result,
      url: listItemUrl,
      fallbackUrl: folderUrl,
      rawPreview: second.raw.slice(0, 700),
      owner,
    });
  }

  if (!first.result.ready) {
    const bothMissing = !first.result.exists && !second.result.exists
      && first.result.reason === 'FOLDER_NOT_FOUND'
      && second.result.reason === 'FOLDER_NOT_FOUND';
    const visibleIncomplete = second.result.exists
      && second.result.reason === 'FOLDER_OBJECT_VISIBLE_WAITING_FOR_LIST_ITEM'
      && !first.result.exists;
    return Object.freeze({
      ...first.result,
      ready: false,
      exists: bothMissing ? false : Boolean(first.result.exists || second.result.exists),
      reason: bothMissing
        ? 'FOLDER_NOT_FOUND'
        : visibleIncomplete
          ? 'FOLDER_OBJECT_VISIBLE_WAITING_FOR_LIST_ITEM'
          : first.result.reason === 'FOLDER_NOT_FOUND'
            ? second.result.reason
            : first.result.reason,
      actualPath: first.result.actualPath || second.result.actualPath,
      url: listItemUrl,
      fallbackUrl: folderUrl,
      rawPreview: (first.raw || second.raw).slice(0, 700),
      owner: { ...owner, id: libraryProbe.result.id },
      evidence: Object.freeze({
        library: libraryProbe.result,
        listItem: first.result,
        folderObject: second.result,
      }),
    });
  }

  if (!second.result.exists
    || second.result.reason === 'FOLDER_PATH_MISMATCH'
    || second.result.reason === 'FOLDER_METADATA_UNRECOGNIZED') {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_METADATA_INCONSISTENT',
      url: listItemUrl,
      fallbackUrl: folderUrl,
      owner: { ...owner, id: libraryProbe.result.id },
      evidence: Object.freeze({
        library: libraryProbe.result,
        listItem: first.result,
        folderObject: second.result,
      }),
    });
  }

  const parentRel = parentSharePointPath(normalized);
  if (first.result.parentPath && !sameSharePointPath(first.result.parentPath, parentRel)) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_PARENT_MISMATCH',
      expectedParentPath: parentRel,
      actualParentPath: first.result.parentPath,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }
  if (first.result.ownerListId
    && text(first.result.ownerListId).toLowerCase() !== text(libraryProbe.result.id).toLowerCase()) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_OWNER_LIBRARY_MISMATCH',
      expectedOwnerListId: libraryProbe.result.id,
      actualOwnerListId: first.result.ownerListId,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }
  if (first.result.ownerLibraryRoot
    && !sameSharePointPath(first.result.ownerLibraryRoot, owner.rootRel)) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_OWNER_LIBRARY_MISMATCH',
      expectedOwnerLibraryRoot: owner.rootRel,
      actualOwnerLibraryRoot: first.result.ownerLibraryRoot,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }

  const parentUrl = buildParentEnumerationEndpoint(webUrl, parentRel, normalized);
  const parentResponse = await request({
    url: parentUrl,
    method: 'GET',
    purpose: `${purpose}-parent-enumeration-${parentRel}`,
    headers: { Accept: 'application/json;odata=verbose' },
  });
  const parentBody = await readResponseBody(parentResponse);
  if (parentResponse.status === 401 || parentResponse.status === 403) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_PROBE_AUTHORIZATION_FAILED',
      status: parentResponse.status,
      url: listItemUrl,
      fallbackUrl: folderUrl,
      parentUrl,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }
  if (!parentResponse.ok) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_PARENT_ENUMERATION_FAILED',
      status: parentResponse.status,
      parentUrl,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }

  const enumerated = unwrapSharePointODataCollection(parentBody.parsed);
  const matching = enumerated
    .map((record) => ({
      ...record?.ListItemAllFields,
      ServerRelativeUrl: record?.ServerRelativeUrl,
      Exists: record?.Exists,
      FileRef: record?.ListItemAllFields?.FileRef || record?.ServerRelativeUrl,
    }))
    .filter((record) => sameSharePointPath(record?.FileRef || record?.ServerRelativeUrl, normalized));
  if (matching.length !== 1) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_PARENT_ENUMERATION_MISMATCH',
      parentUrl,
      enumeratedMatchCount: matching.length,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }
  const parentItem = classifySharePointFolderProbe({
    status: parentResponse.status,
    payload: matching[0],
    expectedPath: normalized,
    probeKind: 'parent-enumeration',
  });
  if (!parentItem.ready || parentItem.id !== first.result.id) {
    return Object.freeze({
      ...first.result,
      ready: false,
      reason: 'FOLDER_PARENT_ENUMERATION_MISMATCH',
      parentUrl,
      parentItem,
      owner: { ...owner, id: libraryProbe.result.id },
    });
  }

  return Object.freeze({
    ...first.result,
    ready: true,
    reason: 'LIST_BACKED_FOLDER_READY',
    url: listItemUrl,
    fallbackUrl: folderUrl,
    parentUrl,
    owner: { ...owner, id: libraryProbe.result.id },
    evidence: Object.freeze({
      library: libraryProbe.result,
      listItem: first.result,
      folderObject: second.result,
      parentEnumeration: parentItem,
    }),
  });
}

export async function diagnoseSharePointFolders({
  webUrl,
  folderPaths = [],
  libraries,
  request,
  purpose = 'folder-diagnostics',
} = {}) {
  const diagnostics = [];
  for (const folderRel of folderPaths) {
    // Sequential reads keep each folder's evidence grouped in request logs.
    // This function is deliberately observational and never calls a mutation.
    const probe = await probeSharePointFolder({
      webUrl,
      folderRel,
      libraries,
      request,
      purpose,
    });
    diagnostics.push(Object.freeze({
      requestedPath: normalizeSharePointPath(folderRel),
      classification: probe.reason,
      ready: probe.ready,
      exists: probe.exists,
      rawFolderExists: probe.evidence?.folderObject?.exists ?? probe.exists,
      listItemId: probe.id ?? probe.evidence?.listItem?.id ?? null,
      fileSystemObjectType: probe.fileSystemObjectType ?? probe.evidence?.listItem?.fileSystemObjectType ?? null,
      canonicalPath: probe.actualPath || probe.evidence?.listItem?.actualPath || '',
      owningListId: probe.owner?.id || '',
      owningLibraryRoot: probe.owner?.rootRel || '',
      parentPath: probe.parentPath || probe.evidence?.listItem?.parentPath || '',
      parentEnumerated: Boolean(probe.evidence?.parentEnumeration?.ready),
      contentTypeId: probe.contentTypeId || probe.evidence?.listItem?.contentTypeId || '',
      visibilityEvidence: probe.evidence?.folderObject?.reason || '',
      permissionEvidence: probe.status === 401 || probe.status === 403
        ? `HTTP_${probe.status}`
        : 'READ_ALLOWED',
      technical: probe,
    }));
  }
  return Object.freeze(diagnostics);
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

export async function createSharePointFolderInLibraryViaJsom({
  webUrl,
  libraryId,
  parentRel,
  leafName,
  sp,
} = {}) {
  const normalizedParent = normalizeSharePointPath(parentRel);
  const leaf = text(leafName);
  if (!text(libraryId) || !normalizedParent || !leaf || leaf.includes('/')) {
    throw new SharePointBrowserFilesystemError(
      'INVALID_FOLDER_CREATION_REQUEST',
      'A verified list ID, exact parent path, and one child name are required.',
      { libraryId: text(libraryId), parentRel: normalizedParent, leafName: leaf },
    );
  }

  const SP = sp || await ensureSharePointJsom(webUrl);
  if (!SP?.ClientContext || !SP?.ListItemCreationInformation || SP?.FileSystemObjectType?.folder === undefined) {
    throw new SharePointBrowserFilesystemError(
      'SHAREPOINT_JSOM_FOLDER_API_UNAVAILABLE',
      'The SharePoint list-backed folder API is unavailable.',
      { webUrl },
    );
  }

  const context = new SP.ClientContext(webUrl);
  const list = context.get_web().get_lists().getById(libraryId);
  const creation = new SP.ListItemCreationInformation();
  creation.set_underlyingObjectType(SP.FileSystemObjectType.folder);
  creation.set_folderUrl(normalizedParent);
  creation.set_leafName(leaf);
  const item = list.addItem(creation);
  item.update();
  context.load(item, 'Id', 'FileSystemObjectType', 'FileRef');

  return new Promise((resolve, reject) => {
    context.executeQueryAsync(
      () => resolve(Object.freeze({
        itemId: Number(item.get_id?.()) || null,
        libraryId: text(libraryId),
        parentRel: normalizedParent,
        leafName: leaf,
      })),
      (_sender, args) => reject(new SharePointBrowserFilesystemError(
        /unauthorized|access denied|permission/i.test([
          args?.get_message?.(),
          args?.get_errorTypeName?.(),
          args?.get_errorCode?.(),
        ].filter(Boolean).join(' '))
          || Number(args?.get_errorCode?.()) === -2147024891
          ? 'FOLDER_CREATE_AUTHORIZATION_FAILED'
          : 'SHAREPOINT_JSOM_FOLDER_CREATE_FAILED',
        'SharePoint did not confirm the list-bound folder creation request.',
        {
          libraryId: text(libraryId),
          parentRel: normalizedParent,
          leafName: leaf,
          serverCode: text(args?.get_errorCode?.()),
          serverType: text(args?.get_errorTypeName?.()),
        },
      )),
    );
  });
}

async function tryCreateFolderViaRest({ webUrl, parentRel, childRel, digest, request, purpose, log }) {
  const leaf = leafSharePointPath(childRel);
  const url = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${escOData(parentRel)}')/Folders/add('${escOData(leaf)}')`;
  const response = await request({
    url,
    method: 'POST',
    purpose,
    headers: {
      Accept: 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-RequestDigest': digest,
    },
  });
  const { raw, parsed } = await readResponseBody(response);
  const ambiguous = response.ok
    || response.status === 409
    || /already exists|already.*folder|כבר קיימ/i.test(responseMessage(parsed, raw));
  log(`folder create transport | child=${childRel} | parent=${parentRel} | status=${response.status} | ambiguous=${ambiguous} | endpoint=${url}`);
  return {
    accepted: response.ok,
    ambiguous,
    response,
    raw,
    parsed,
    url,
  };
}

export async function ensureSharePointFolder({
  webUrl,
  folderRel,
  siteRoot,
  libraries,
  digest,
  request,
  log = () => {},
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = sleepDefault,
  createFolder = createSharePointFolderInLibraryViaJsom,
  allowRestFallback = true,
} = {}) {
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
  if (firstProbe.exists) {
    try {
      const reconciled = await waitForSharePointFolder({
        webUrl,
        folderRel: normalized,
        libraries,
        request,
        log,
        retryDelaysMs,
        sleep,
        purpose: 'reconcile-existing-folder',
      });
      return Object.freeze({ existed: true, created: false, path: normalized, probe: reconciled });
    } catch (error) {
      throw new SharePointBrowserFilesystemError(
        'FOLDER_RECONCILIATION_REQUIRED',
        `SharePoint exposes "${normalized}", but its list-backed identity is incomplete or inconsistent. No replacement was attempted.`,
        { folderRel: normalized, firstProbe, lastProbe: error?.details?.lastProbe },
        error,
      );
    }
  }
  if (firstProbe.reason !== 'FOLDER_NOT_FOUND') {
    throw new SharePointBrowserFilesystemError(
      'FOLDER_PROBE_INCONCLUSIVE',
      `SharePoint did not provide enough consistent evidence to create "${normalized}".`,
      { folderRel: normalized, firstProbe },
    );
  }

  const parent = parentSharePointPath(normalized);
  const parentResult = await ensureSharePointFolder({
    webUrl,
    folderRel: parent,
    siteRoot,
    libraries,
    digest,
    request,
    log,
    retryDelaysMs,
    sleep,
    createFolder,
    allowRestFallback,
  });
  const libraryId = text(parentResult?.probe?.owner?.id || parentResult?.probe?.id || owner.id);
  if (!libraryId) {
    throw new SharePointBrowserFilesystemError(
      'FOLDER_OWNER_LIBRARY_UNCONFIRMED',
      `The owning document library for "${normalized}" has no verified list ID.`,
      { folderRel: normalized, owner, parentResult },
    );
  }

  let creation = null;
  let creationError = null;
  try {
    creation = await createFolder({
      webUrl,
      libraryId,
      parentRel: parent,
      leafName: leafSharePointPath(normalized),
    });
  } catch (error) {
    creationError = error;
    if (error?.code === 'FOLDER_CREATE_AUTHORIZATION_FAILED') throw error;
    const jsomUnavailable = error?.code === EXACT_LIBRARY_ERRORS.JSOM_UNAVAILABLE
      || error?.code === 'SHAREPOINT_JSOM_FOLDER_API_UNAVAILABLE';
    if (jsomUnavailable && allowRestFallback) {
      creation = await tryCreateFolderViaRest({
        webUrl,
        parentRel: parent,
        childRel: normalized,
        digest,
        request,
        purpose: `create-folder-${normalized}`,
        log,
      });
      if (!creation.accepted && !creation.ambiguous
        && (creation.response.status === 401 || creation.response.status === 403)) {
        throw new SharePointBrowserFilesystemError(
          'FOLDER_CREATE_AUTHORIZATION_FAILED',
          `SharePoint denied folder creation for "${normalized}".`,
          { folderRel: normalized, status: creation.response.status, url: creation.url },
        );
      }
      if (!creation.accepted && !creation.ambiguous) {
        throw new SharePointBrowserFilesystemError(
          'FOLDER_CREATE_FAILED',
          `SharePoint rejected folder creation for "${normalized}" with HTTP ${creation.response.status}.`,
          {
            folderRel: normalized,
            status: creation.response.status,
            responsePreview: creation.raw.slice(0, 700),
            url: creation.url,
          },
        );
      }
    }
  }

  try {
    const ready = await waitForSharePointFolder({
      webUrl,
      folderRel: normalized,
      libraries,
      request,
      log,
      retryDelaysMs,
      sleep,
      purpose: 'verify-created-folder',
    });
    return Object.freeze({
      existed: false,
      created: true,
      path: normalized,
      probe: ready,
      creation,
      recoveredAfterAmbiguousCreate: Boolean(creationError || creation?.ambiguous),
    });
  } catch (verificationError) {
    throw new SharePointBrowserFilesystemError(
      'FOLDER_CREATE_VERIFY_FAILED',
      `SharePoint did not expose a writable list-backed folder at "${normalized}" after the single creation operation.`,
      {
        folderRel: normalized,
        creationAttempted: true,
        creationCode: creationError?.code || '',
        creationMessage: creationError?.message || '',
        lastProbe: verificationError?.details?.lastProbe,
      },
      verificationError,
    );
  }
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

function uploadedFilePath(payload) {
  const record = unwrapSharePointODataRecord(payload);
  return normalizeSharePointPath(record?.ServerRelativeUrl);
}

async function verifyUploadedSharePointFile({
  webUrl,
  fileRel,
  expectedBytes,
  request,
  retryDelaysMs,
  sleep,
}) {
  const expectedPath = normalizeSharePointPath(fileRel);
  const expectedLength = Number(expectedBytes?.byteLength ?? expectedBytes?.length ?? expectedBytes?.size);
  const url = `${webUrl}/_api/web/GetFileByServerRelativeUrl('${escOData(expectedPath)}')`
    + '?$select=Name,ServerRelativeUrl,Length,Exists,ListItemAllFields/Id&$expand=ListItemAllFields';
  let lastEvidence = null;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    const delay = Number(retryDelaysMs[attempt] || 0);
    if (delay > 0) await sleep(delay);
    const response = await request({
      url,
      method: 'GET',
      purpose: `verify-uploaded-file-${expectedPath}-attempt-${attempt + 1}`,
      headers: { Accept: 'application/json;odata=verbose' },
    });
    const { raw, parsed } = await readResponseBody(response);
    const record = unwrapSharePointODataRecord(parsed);
    const actualPath = normalizeSharePointPath(record?.ServerRelativeUrl);
    const actualLength = Number(record?.Length);
    const itemId = Number(record?.ListItemAllFields?.Id);
    lastEvidence = {
      status: response.status,
      actualPath,
      actualLength: Number.isFinite(actualLength) ? actualLength : null,
      itemId: Number.isFinite(itemId) && itemId > 0 ? itemId : null,
      responsePreview: raw.slice(0, 700),
    };
    if (response.status === 401 || response.status === 403) break;
    if (response.ok
      && record?.Exists !== false
      && sameSharePointPath(actualPath, expectedPath)
      && Number.isFinite(actualLength)
      && (!Number.isFinite(expectedLength) || actualLength === expectedLength)
      && lastEvidence.itemId) {
      return Object.freeze({ ...lastEvidence, url });
    }
  }
  throw new SharePointBrowserFilesystemError(
    'FILE_UPLOAD_VERIFY_FAILED',
    `SharePoint did not verify the uploaded file at "${expectedPath}".`,
    { fileRel: expectedPath, url, lastEvidence },
  );
}

export function isSharePointDigestExpired({ status, payload, raw = '' } = {}) {
  if (Number(status) !== 403) return false;
  return /security validation|request digest|formdigest|0x8102006d/i.test(responseMessage(payload, raw));
}

export async function uploadSharePointFileBytes({
  webUrl,
  folderRel,
  fileName,
  bytes,
  siteRoot,
  libraries,
  digest,
  request,
  log = () => {},
  contentType = 'application/octet-stream',
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = sleepDefault,
  refreshDigest,
} = {}) {
  const normalizedFolder = normalizeSharePointPath(folderRel);
  const owner = findOwningLibrary(normalizedFolder, libraries);
  if (!owner) {
    throw new SharePointBrowserFilesystemError('UPLOAD_OUTSIDE_CONFIGURED_LIBRARIES', `Upload folder "${normalizedFolder}" is outside configured libraries.`, { folderRel: normalizedFolder });
  }

  let lastFailure = null;
  let activeDigest = digest;
  let digestRefreshes = 0;
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await ensureSharePointFolder({
      webUrl,
      folderRel: normalizedFolder,
      siteRoot,
      libraries,
      digest: activeDigest,
      request,
      log,
      retryDelaysMs,
      sleep,
    });
    const candidates = uploadCandidates({ webUrl, siteRoot, folderRel: normalizedFolder, fileName, owner });
    for (const url of candidates) {
      const response = await request({
        url,
        method: 'POST',
        purpose: `upload-${normalizeSharePointPath(`${normalizedFolder}/${fileName}`)}-cycle-${cycle + 1}`,
        headers: {
          Accept: 'application/json;odata=verbose',
          'Content-Type': contentType,
          'X-RequestDigest': activeDigest,
        },
        body: bytes,
      });
      const { raw, parsed } = await readResponseBody(response);
      log(`file upload | folder=${normalizedFolder} | file=${fileName} | cycle=${cycle + 1}/4 | status=${response.status} | endpoint=${url}`);
      if (response.ok) {
        const expectedFileRel = normalizeSharePointPath(`${normalizedFolder}/${fileName}`);
        const returnedPath = uploadedFilePath(parsed);
        if (!returnedPath || !sameSharePointPath(returnedPath, expectedFileRel)) {
          throw new SharePointBrowserFilesystemError(
            'FILE_UPLOAD_RESPONSE_MISMATCH',
            `SharePoint upload response did not identify the expected file "${expectedFileRel}".`,
            { expectedFileRel, returnedPath, status: response.status, url },
          );
        }
        const verification = await verifyUploadedSharePointFile({
          webUrl,
          fileRel: expectedFileRel,
          expectedBytes: bytes,
          request,
          retryDelaysMs,
          sleep,
        });
        return Object.freeze({
          status: response.status,
          url,
          fileRel: expectedFileRel,
          cycle: cycle + 1,
          verification,
        });
      }
      if (isSharePointDigestExpired({ status: response.status, payload: parsed, raw })
        && typeof refreshDigest === 'function'
        && digestRefreshes < 1) {
        activeDigest = await refreshDigest();
        digestRefreshes += 1;
        lastFailure = {
          status: response.status,
          url,
          responsePreview: raw.slice(0, 700),
          retryable: true,
          reason: 'DIGEST_EXPIRED',
        };
        break;
      }
      const retryable = isSharePointDirectoryNotReady({ status: response.status, payload: parsed, raw });
      lastFailure = { status: response.status, url, responsePreview: raw.slice(0, 700), retryable };
      if (!retryable) {
        throw new SharePointBrowserFilesystemError('FILE_UPLOAD_FAILED', `SharePoint rejected upload of "${fileName}" with HTTP ${response.status}.`, { folderRel: normalizedFolder, fileName, ...lastFailure });
      }
    }
    if (cycle < 1) {
      await sleep(retryDelaysMs[Math.min(cycle + 3, retryDelaysMs.length - 1)] || 1000);
    }
  }

  throw new SharePointBrowserFilesystemError('FILE_UPLOAD_FOLDER_NOT_READY', `SharePoint could not upload "${fileName}" because folder "${normalizedFolder}" never became writable.`, { folderRel: normalizedFolder, fileName, lastFailure });
}

export { DEFAULT_RETRY_DELAYS_MS as SHAREPOINT_BROWSER_RETRY_DELAYS_MS };
