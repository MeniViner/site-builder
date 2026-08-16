import {
  normalizeServerRelativePath,
  normalizeSharePointLibraryRecord,
} from './sharePointLibraryClassifier';

export const EXACT_LIBRARY_OUTCOMES = Object.freeze({
  REUSE: 'REUSE_EXISTING_EXACT_LIBRARY',
  CREATE: 'CREATE_EXACT_LIBRARY',
  CREATED: 'CREATED_EXACT_LIBRARY',
});

export const EXACT_LIBRARY_ERRORS = Object.freeze({
  COLLISION: 'LIBRARY_URL_COLLISION',
  ALLOCATION_FAILED: 'LIBRARY_URL_ALLOCATION_FAILED',
  NOT_DOCUMENT_LIBRARY: 'LIBRARY_EXISTS_NOT_DOCUMENT_LIBRARY',
  JSOM_UNAVAILABLE: 'SHAREPOINT_JSOM_UNAVAILABLE',
});

const normalizeTitle = (value) => String(value ?? '').trim();
const sameText = (left, right) => normalizeTitle(left).toLowerCase() === normalizeTitle(right).toLowerCase();
const recordId = (record) => String(record?.Id ?? record?.ID ?? record?.id ?? '').trim();
const recordTitle = (record) => normalizeTitle(record?.Title ?? record?.title);
const recordTemplate = (record) => {
  const value = Number(record?.BaseTemplate ?? record?.baseTemplate);
  return Number.isFinite(value) ? value : null;
};
const recordRoot = (record) => normalizeServerRelativePath(
  record?.RootFolder?.ServerRelativeUrl
    ?? record?.rootFolder?.serverRelativeUrl
    ?? record?.rootFolder,
);

const libraryDetails = (record, configuredTitle, expectedRoot) => Object.freeze({
  configuredTitle: normalizeTitle(configuredTitle),
  expectedRoot: normalizeServerRelativePath(expectedRoot),
  actualListId: recordId(record),
  actualTitle: recordTitle(record),
  actualRoot: recordRoot(record),
  baseTemplate: recordTemplate(record),
});

export class ExactLibraryProvisioningError extends Error {
  constructor(code, details = {}, cause) {
    const expected = normalizeServerRelativePath(details.expectedRoot);
    const actual = normalizeServerRelativePath(details.actualRoot);
    super(`${code}: configured title "${details.configuredTitle || ''}" expected root "${expected}" but SharePoint reported "${actual || '(missing)'}".`, { cause });
    this.name = 'ExactLibraryProvisioningError';
    this.code = code;
    this.step = 'ensure-exact-library-root';
    Object.assign(this, details, { expectedRoot: expected, actualRoot: actual });
  }
}

export function deriveSiteRelativeListUrl(siteRoot, expectedRoot) {
  const normalizedSiteRoot = normalizeServerRelativePath(siteRoot);
  const normalizedExpectedRoot = normalizeServerRelativePath(expectedRoot);
  const prefix = `${normalizedSiteRoot}/`.toLowerCase();
  if (!normalizedSiteRoot || !normalizedExpectedRoot.toLowerCase().startsWith(prefix)) {
    throw new Error(`Configured library root "${normalizedExpectedRoot}" must be inside SharePoint web "${normalizedSiteRoot}".`);
  }
  const relativeUrl = normalizedExpectedRoot.slice(normalizedSiteRoot.length + 1);
  if (!relativeUrl || relativeUrl.includes('/')) {
    throw new Error(`Configured library root "${normalizedExpectedRoot}" must identify one direct library URL under "${normalizedSiteRoot}".`);
  }
  return relativeUrl;
}

export function unwrapSharePointODataCollection(payload) {
  const source = payload?.d?.results ?? payload?.d ?? payload?.value ?? payload;
  if (!Array.isArray(source)) return [];
  return source.map(normalizeSharePointLibraryRecord).filter(Boolean);
}

export function findSharePointLibraryByRoot(records, expectedRoot) {
  const normalizedExpectedRoot = normalizeServerRelativePath(expectedRoot);
  return (records || []).find((record) => sameText(recordRoot(record), normalizedExpectedRoot)) || null;
}

export function classifyExactLibraryState({ configuredTitle, expectedRoot, titleRecord, rootRecord } = {}) {
  const normalizedTitleRecord = normalizeSharePointLibraryRecord(titleRecord);
  const normalizedRootRecord = normalizeSharePointLibraryRecord(rootRecord);
  const normalizedExpectedRoot = normalizeServerRelativePath(expectedRoot);

  if (normalizedTitleRecord) {
    const details = libraryDetails(normalizedTitleRecord, configuredTitle, normalizedExpectedRoot);
    if (!sameText(details.actualRoot, normalizedExpectedRoot)) {
      throw new ExactLibraryProvisioningError(EXACT_LIBRARY_ERRORS.COLLISION, details);
    }
    if (details.baseTemplate !== 101) {
      throw new ExactLibraryProvisioningError(EXACT_LIBRARY_ERRORS.NOT_DOCUMENT_LIBRARY, details);
    }
    if (normalizedRootRecord && recordId(normalizedRootRecord) && recordId(normalizedTitleRecord)
      && !sameText(recordId(normalizedRootRecord), recordId(normalizedTitleRecord))) {
      throw new ExactLibraryProvisioningError(
        EXACT_LIBRARY_ERRORS.COLLISION,
        libraryDetails(normalizedRootRecord, configuredTitle, normalizedExpectedRoot),
      );
    }
    return Object.freeze({ outcome: EXACT_LIBRARY_OUTCOMES.REUSE, record: normalizedTitleRecord });
  }

  if (normalizedRootRecord) {
    throw new ExactLibraryProvisioningError(
      EXACT_LIBRARY_ERRORS.COLLISION,
      libraryDetails(normalizedRootRecord, configuredTitle, normalizedExpectedRoot),
    );
  }

  return Object.freeze({ outcome: EXACT_LIBRARY_OUTCOMES.CREATE, record: null });
}

export async function ensureExactSharePointLibrary({
  siteRoot,
  configuredTitle,
  expectedRoot,
  readByTitle,
  readAllLibraries,
  createWithExactUrl,
} = {}) {
  const titleRecord = await readByTitle(configuredTitle);
  const rootRecord = findSharePointLibraryByRoot(await readAllLibraries(), expectedRoot);
  const preflight = classifyExactLibraryState({ configuredTitle, expectedRoot, titleRecord, rootRecord });
  if (preflight.outcome === EXACT_LIBRARY_OUTCOMES.REUSE) {
    return Object.freeze({ ...preflight, created: false, siteRelativeUrl: deriveSiteRelativeListUrl(siteRoot, expectedRoot) });
  }

  const siteRelativeUrl = deriveSiteRelativeListUrl(siteRoot, expectedRoot);
  let createdRecord;
  try {
    createdRecord = normalizeSharePointLibraryRecord(await createWithExactUrl({
      title: configuredTitle,
      siteRelativeUrl,
      expectedRoot: normalizeServerRelativePath(expectedRoot),
    }));
  } catch (error) {
    if (error instanceof ExactLibraryProvisioningError) throw error;
    throw new ExactLibraryProvisioningError(EXACT_LIBRARY_ERRORS.ALLOCATION_FAILED, {
      configuredTitle: normalizeTitle(configuredTitle),
      expectedRoot: normalizeServerRelativePath(expectedRoot),
      actualListId: '',
      actualTitle: '',
      actualRoot: '',
      baseTemplate: null,
    }, error);
  }
  const details = libraryDetails(createdRecord, configuredTitle, expectedRoot);
  if (!createdRecord || details.baseTemplate !== 101 || !sameText(details.actualTitle, configuredTitle)
    || !sameText(details.actualRoot, expectedRoot) || !details.actualListId) {
    throw new ExactLibraryProvisioningError(EXACT_LIBRARY_ERRORS.ALLOCATION_FAILED, details);
  }
  return Object.freeze({
    outcome: EXACT_LIBRARY_OUTCOMES.CREATED,
    record: createdRecord,
    created: true,
    siteRelativeUrl,
  });
}

const scriptPromises = new Map();

const loadScript = (url) => {
  if (scriptPromises.has(url)) return scriptPromises.get(url);
  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing?.dataset.siteBuilderLoaded === 'true') {
      resolve();
      return;
    }
    if (existing && document.readyState !== 'loading') {
      resolve();
      return;
    }
    const script = existing || document.createElement('script');
    script.src = url;
    script.async = false;
    script.addEventListener('load', () => {
      script.dataset.siteBuilderLoaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load SharePoint JSOM script: ${url}`)), { once: true });
    if (!existing) document.head.appendChild(script);
  });
  scriptPromises.set(url, promise);
  return promise;
};

export async function ensureSharePointJsom(webUrl) {
  if (globalThis.SP?.ClientContext && globalThis.SP?.ListCreationInformation) return globalThis.SP;
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new ExactLibraryProvisioningError(EXACT_LIBRARY_ERRORS.JSOM_UNAVAILABLE, {});
  }
  const web = new URL(webUrl, window.location.origin);
  const layoutsRoot = `${web.origin}${normalizeServerRelativePath(web.pathname)}/_layouts/15`;
  for (const fileName of ['init.js', 'MicrosoftAjax.js', 'SP.Runtime.js', 'SP.js']) {
    await loadScript(`${layoutsRoot}/${fileName}`);
  }
  if (!globalThis.SP?.ClientContext || !globalThis.SP?.ListCreationInformation) {
    throw new ExactLibraryProvisioningError(EXACT_LIBRARY_ERRORS.JSOM_UNAVAILABLE, {});
  }
  return globalThis.SP;
}

export async function createDocumentLibraryWithExactUrl({
  webUrl,
  title,
  siteRelativeUrl,
  description = 'Application system database library',
  sp,
} = {}) {
  const SP = sp || await ensureSharePointJsom(webUrl);
  const context = new SP.ClientContext(webUrl);
  const creation = new SP.ListCreationInformation();
  creation.set_title(title);
  creation.set_templateType(101);
  creation.set_url(siteRelativeUrl);
  const list = context.get_web().get_lists().add(creation);
  if (typeof list.set_description === 'function') list.set_description(description);
  if (typeof list.set_onQuickLaunch === 'function') list.set_onQuickLaunch(true);
  if (typeof list.update === 'function') list.update();
  const rootFolder = list.get_rootFolder();
  context.load(list);
  context.load(rootFolder);

  return new Promise((resolve, reject) => {
    context.executeQueryAsync(
      () => resolve(normalizeSharePointLibraryRecord({
        Id: String(list.get_id?.()?.toString?.() ?? list.get_id?.() ?? ''),
        Title: list.get_title?.() ?? title,
        BaseTemplate: list.get_baseTemplate?.() ?? null,
        DefaultViewUrl: list.get_defaultViewUrl?.() ?? '',
        OnQuickLaunch: list.get_onQuickLaunch?.() ?? true,
        RootFolder: {
          ServerRelativeUrl: rootFolder.get_serverRelativeUrl?.() ?? '',
          WelcomePage: rootFolder.get_welcomePage?.() ?? '',
        },
      })),
      (_sender, args) => reject(new Error(args?.get_message?.() || 'SharePoint JSOM library creation failed.')),
    );
  });
}
