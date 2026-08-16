const text = (value) => String(value ?? '').trim();

const normalizeServerRelativePath = (value) => {
  const raw = text(value);
  if (!raw) return '';
  try {
    const pathname = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw;
    return `/${pathname.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  } catch {
    return `/${raw.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  }
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const field = (record, name) => {
  if (!isRecord(record)) return undefined;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : record[key];
};

const unwrapSingleRecord = (value) => {
  if (isRecord(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isRecord(value[0])) return value[0];
  return null;
};

export function normalizeSharePointLibraryRecord(record) {
  if (!isRecord(record)) return null;
  const root = field(record, 'RootFolder');
  const normalizedRoot = isRecord(root)
    ? {
      ...root,
      ServerRelativeUrl: field(root, 'ServerRelativeUrl') ?? '',
      WelcomePage: field(root, 'WelcomePage') ?? '',
    }
    : null;
  return {
    ...record,
    Title: field(record, 'Title') ?? '',
    BaseTemplate: field(record, 'BaseTemplate') ?? null,
    BaseType: field(record, 'BaseType') ?? null,
    DefaultViewUrl: field(record, 'DefaultViewUrl') ?? '',
    OnQuickLaunch: field(record, 'OnQuickLaunch') ?? null,
    RootFolder: normalizedRoot,
  };
}

/**
 * Normalizes the verbose, minimal, and value-wrapped OData shapes observed
 * from SharePoint list reads. It intentionally refuses arbitrary arrays so a
 * malformed response is reported as unrecognized rather than as "missing".
 */
export function unwrapSharePointODataRecord(payload) {
  if (!isRecord(payload)) return { record: null, responseType: 'unrecognized' };
  const verbose = unwrapSingleRecord(field(payload, 'd'));
  if (verbose) return { record: verbose, responseType: 'verbose' };
  const value = unwrapSingleRecord(field(payload, 'value'));
  if (value) return { record: value, responseType: 'value' };
  return { record: payload, responseType: 'direct' };
}

export function classifySharePointLibraryResponse({
  status = 0,
  payload,
  title = '',
  expectedRootUrl = '',
  parsedAs = 'json',
} = {}) {
  const numericStatus = Number(status || 0);
  if (numericStatus === 404) {
    return Object.freeze({
      status: numericStatus,
      parsedAs,
      responseType: 'not-found',
      exists: false,
      isDocumentLibrary: false,
      ready: false,
      reason: 'LIBRARY_NOT_FOUND',
      baseTemplate: null,
      baseType: null,
      rootFolder: '',
    });
  }

  const { record: rawRecord, responseType } = unwrapSharePointODataRecord(payload);
  const record = normalizeSharePointLibraryRecord(rawRecord);
  if (!numericStatus || numericStatus < 200 || numericStatus >= 300 || !record) {
    return Object.freeze({
      status: numericStatus,
      parsedAs,
      responseType,
      exists: numericStatus >= 200 && numericStatus < 300,
      isDocumentLibrary: false,
      ready: false,
      reason: 'LIBRARY_RESPONSE_UNRECOGNIZED',
      baseTemplate: null,
      baseType: null,
      rootFolder: '',
    });
  }

  const rawTemplate = field(record, 'BaseTemplate');
  const parsedTemplate = Number(rawTemplate);
  const baseTemplate = text(rawTemplate) !== '' && Number.isFinite(parsedTemplate) ? parsedTemplate : null;
  const rawBaseType = field(record, 'BaseType');
  const parsedBaseType = Number(rawBaseType);
  const baseType = text(rawBaseType) !== '' && Number.isFinite(parsedBaseType) ? parsedBaseType : (text(rawBaseType) || null);
  const root = field(record, 'RootFolder');
  const rootFolder = normalizeServerRelativePath(field(root, 'ServerRelativeUrl'));
  const expectedRoot = normalizeServerRelativePath(expectedRootUrl);
  const actualTitle = text(field(record, 'Title'));
  const hasDocumentLibraryType = baseTemplate === 101
    || baseType === 1
    || String(baseType || '').toLowerCase() === 'documentlibrary';
  const hasExplicitNonLibraryType = (baseTemplate !== null && baseTemplate !== 101)
    || (baseTemplate === null && baseType !== null && baseType !== 1 && String(baseType).toLowerCase() !== 'documentlibrary');
  const titleMatches = !title || !actualTitle || actualTitle.toLowerCase() === text(title).toLowerCase();

  if (!titleMatches || (expectedRoot && rootFolder && rootFolder.toLowerCase() !== expectedRoot.toLowerCase())) {
    return Object.freeze({
      status: numericStatus,
      parsedAs,
      responseType,
      exists: true,
      isDocumentLibrary: hasDocumentLibraryType,
      ready: false,
      reason: 'LIBRARY_ROOT_MISMATCH',
      baseTemplate,
      baseType,
      rootFolder,
      record,
    });
  }
  if (hasExplicitNonLibraryType) {
    return Object.freeze({
      status: numericStatus,
      parsedAs,
      responseType,
      exists: true,
      isDocumentLibrary: false,
      ready: false,
      reason: 'LIBRARY_EXISTS_NOT_DOCUMENT_LIBRARY',
      baseTemplate,
      baseType,
      rootFolder,
      record,
    });
  }
  if (!hasDocumentLibraryType || (expectedRoot && !rootFolder)) {
    return Object.freeze({
      status: numericStatus,
      parsedAs,
      responseType,
      exists: true,
      isDocumentLibrary: false,
      ready: false,
      reason: 'LIBRARY_RESPONSE_UNRECOGNIZED',
      baseTemplate,
      baseType,
      rootFolder,
      record,
    });
  }
  return Object.freeze({
    status: numericStatus,
    parsedAs,
    responseType,
    exists: true,
    isDocumentLibrary: true,
    ready: true,
    reason: 'LIBRARY_READY',
    baseTemplate,
    baseType,
    rootFolder,
    record,
  });
}

export { normalizeServerRelativePath };
