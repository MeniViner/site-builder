import React, { useEffect, useMemo, useRef, useState } from 'react';
import { resolveCurrentSharePointWebUrl } from '../utils/resolveCurrentSharePointWebUrl';
import { useAuth } from '../context/AuthContext';
import { spBootstrapLog } from '../utils/spAppLog';
import { DEFAULT_GANTT_DATA } from '../utils/ganttData';
import { createInitialBoomData } from '../utils/boomData';
import DismissibleNotice from '../components/DismissibleNotice';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import {
  classifySharePointLibraryResponse,
} from '../utils/sharePointLibraryClassifier';
import {
  EXACT_LIBRARY_ERRORS,
  EXACT_LIBRARY_OUTCOMES,
  createDocumentLibraryWithExactUrl,
  ensureExactSharePointLibrary,
  unwrapSharePointODataCollection,
} from '../utils/sharePointExactLibraryProvisioning';
import {
  assertIndexReferencesMatchManifest,
  normalizeAtomicBuildManifest,
  orderFilesForAtomicDeployment,
} from '../utils/atomicDeploymentManifest';
import {
  LEGACY_PIPELINE_STAGES,
  LegacyPipelineError,
  classifyTxtSeed,
  createLegacyStageState,
  deriveRequiredFolders,
  formatLegacyFailure,
  legacyPipelineFailure,
  normalizeLegacyFailure,
  executeBrowserStage,
  runFinalAssetStages,
} from '../utils/legacyPipeline';
import {
  LEGACY_PROVISIONING_STATUSES,
  writeLegacyProvisioningStatus,
} from '../utils/sharePointSetupContext';
import {
  ensureSharePointFolder,
  probeSharePointFolder,
  readSharePointFileBytes,
  uploadSharePointFileBytes,
  waitForSharePointFolder,
} from '../utils/sharePointBrowserFilesystem';
import { ensureUsersDbFolderPermissionsReady } from '../services/sharePointPermissionsSetup';

const ODATA_ACCEPT = 'application/json;odata=verbose';
const ODATA_CONTENT = 'application/json;odata=verbose';

const esc = (value) => String(value ?? '').replace(/'/g, "''");
const toServerRelativePath = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try { return new URL(raw).pathname.replace(/\/+$/g, ''); } catch { return ''; }
  }
  return raw.startsWith('/') ? raw.replace(/\/+$/g, '') : '';
};
const lastPathSegment = (value, fallback) => {
  const serverRelative = toServerRelativePath(value);
  const source = serverRelative || String(value ?? '');
  return source.split('/').filter(Boolean).pop() || fallback;
};
const resolveLibraryConfig = (rawValue, fallbackTitle, siteRoot) => {
  const fullPath = toServerRelativePath(rawValue);
  const title = lastPathSegment(rawValue, fallbackTitle);
  const rootRel = fullPath || `${siteRoot}/${title}`;
  return { title, rootRel };
};
const looksHtml = (text) => /^\s*<!doctype|^\s*<html/i.test(String(text || ''));

async function readResponseSafely(response, context = {}) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const preview = text.slice(0, 700);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}. URL: ${context.url || ''}. Response preview: ${preview}`);
  }
  if (contentType.includes('application/json')) return text ? JSON.parse(text) : {};
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawText: text, contentType, isHtml: looksHtml(text), preview };
  }
}

const LABELS = { waiting: 'ממתין', running: 'בביצוע', passed: 'עבר', checking: 'בבדיקה', exists: 'קיים', created: 'נוצר', copying: 'מעתיק', partial: 'הועתק חלקית', failed: 'נכשל', done: 'הושלם' };
const badgeClass = (s) => {
  if (s === 'done' || s === 'created' || s === 'exists' || s === 'passed') return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (s === 'partial') return 'bg-amber-100 text-amber-900 border-amber-300';
  if (s === 'failed') return 'bg-red-100 text-red-900 border-red-300';
  if (s === 'copying' || s === 'checking' || s === 'running') return 'bg-blue-100 text-blue-900 border-blue-300';
  return 'bg-slate-100 text-slate-900 border-slate-300';
};

export default function AdminSharePointSetupPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [latestStep, setLatestStep] = useState('ממתין');
  const [errorInfo, setErrorInfo] = useState(null);
  const activeStageRef = useRef('BOOTSTRAP_PAGE_LOAD');
  const [stageState, setStageState] = useState(() => createLegacyStageState({
    LEGACY_BUILD: 'passed',
    LIBRARY_CHECK: 'passed',
    BOOTSTRAP_UPLOAD: 'passed',
    BOOTSTRAP_INDEX_COMMIT: 'passed',
    BOOTSTRAP_VERIFY: 'passed',
  }));
  const [copyStats, setCopyStats] = useState({ manifestUrl: '', buildId: '', manifestCount: 0, copied: 0, verified: 0, failed: 0, mismatched: 0, finalIndex: false, finalAssets: false });
  const [details, setDetails] = useState({ copiedFiles: [], failedFiles: [], skippedFiles: [] });
  const [state, setState] = useState({
    webUrl: '',
    bootstrapPath: '',
    finalPath: '',
    finalAppUrl: '',
    siteDb: 'waiting',
    usersDb: 'waiting',
    dist: 'waiting',
    siteAssets: 'waiting',
    images: 'waiting',
    txtFiles: 'waiting',
    copyFiles: 'waiting',
    finalIndex: 'waiting',
  });

  const cfg = useMemo(() => {
    const {
      host, siteCode, siteRoot, siteDbFolder, siteDbRoot, usersDbFolder, usersDbRoot,
      siteAssetsRoot, imagesRoot, widgetsFileServerRelativeUrl,
      eventsFileServerRelativeUrl, navigationFileServerRelativeUrl, usersFileServerRelativeUrl,
      siteContentFileServerRelativeUrl, themeFileServerRelativeUrl, externalLinksFileServerRelativeUrl,
      ganttFileServerRelativeUrl, boomFileServerRelativeUrl, masterConfigFileServerRelativeUrl,
      bootstrapLibrary, bootstrapFolder, targetDistPath, finalAppUrl,
    } = SHAREPOINT_PATHS;
    const siteDbLib = resolveLibraryConfig(siteDbRoot || siteDbFolder, siteDbFolder, siteRoot);
    const usersDbLib = resolveLibraryConfig(usersDbRoot || usersDbFolder, usersDbFolder, siteRoot);
    const bootstrapDistRoot = `${siteRoot}/${bootstrapLibrary}/${bootstrapFolder}/dist`;
    const finalDistRoot = targetDistPath || `${siteDbLib.rootRel}/dist`;
    return {
      host, siteCode, siteRoot, bootstrapLibrary, bootstrapFolder,
      siteDb: siteDbLib.title, siteDbRoot: siteDbLib.rootRel, usersDb: usersDbLib.title, usersDbRoot: usersDbLib.rootRel,
      siteAssetsRoot, imagesRoot, widgetsFileServerRelativeUrl,
      eventsFileServerRelativeUrl, navigationFileServerRelativeUrl, usersFileServerRelativeUrl,
      siteContentFileServerRelativeUrl, themeFileServerRelativeUrl, externalLinksFileServerRelativeUrl,
      ganttFileServerRelativeUrl, boomFileServerRelativeUrl, masterConfigFileServerRelativeUrl,
      bootstrapDistRoot, finalDistRoot,
      finalAppUrl: finalAppUrl || `https://${host}${finalDistRoot}/index.html`,
      manifestRel: `${bootstrapDistRoot}/sharepoint-deploy-manifest.json`,
      manifestAbs: `https://${host}${bootstrapDistRoot}/sharepoint-deploy-manifest.json`,
    };
  }, []);

  const buildInitialMasterConfig = () => ({ schemaVersion: '1.0.0' });

  const addLog = (msg, prefix = 'sharepoint-browser-setup') => {
    const line = `[${prefix}] ${msg}`;
    spBootstrapLog.info(line);
    setLogs((prev) => [...prev, line]);
  };
  const addRunSeparator = () => addLog(`--- run ${new Date().toISOString()} ---`);
  const setLegacyStage = (stage, stageStatus, details = {}) => {
    activeStageRef.current = stage;
    setStageState((previous) => ({ ...previous, [stage]: stageStatus }));
    const detailText = Object.entries(details).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `${key}=${value}`).join(' | ');
    addLog(`${stage}: ${stageStatus.toUpperCase()}${detailText ? ` | ${detailText}` : ''}`, `legacy][${stage}`);
    setLatestStep(stage);
  };

  const runStage = async (stage, operation, work, context = {}) => {
    return executeBrowserStage({
      stage,
      operation,
      work,
      context,
      onStatus: setLegacyStage,
    });
  };

  const logRequest = async ({ url, method = 'GET', purpose, headers, body }) => {
    const upperMethod = String(method || 'GET').toUpperCase();
    const isApi = String(url || '').includes('/_api/');
    const mergedHeaders = { ...(headers || {}) };
    if (isApi && !mergedHeaders.Accept) {
      mergedHeaders.Accept = ODATA_ACCEPT;
    }
    const isBinaryBody = body instanceof ArrayBuffer
      || ArrayBuffer.isView(body)
      || (typeof Blob !== 'undefined' && body instanceof Blob);
    if (isApi && upperMethod !== 'GET' && upperMethod !== 'HEAD' && !mergedHeaders['Content-Type'] && !isBinaryBody) {
      mergedHeaders['Content-Type'] = ODATA_CONTENT;
    }
    const started = Date.now();
    const res = await fetch(url, { method: upperMethod, credentials: 'include', headers: mergedHeaders, body });
    const durationMs = Date.now() - started;
    const ct = res.headers.get('content-type') || '';
    addLog(`request ${method} ${url} | purpose=${purpose} | status=${res.status} | content-type=${ct} | durationMs=${durationMs}`);
    return res;
  };

  const checkLibraryExists = async (webUrl, title) => {
    const endpoint = `${webUrl}/_api/web/lists/GetByTitle('${esc(title)}')?$select=Id,Title,BaseTemplate,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,OnQuickLaunch&$expand=RootFolder`;
    const res = await logRequest({ url: endpoint, purpose: `library-check-${title}` });
    const contentType = res.headers.get('content-type') || '';
    const status = res.status;
    const statusText = res.statusText;
    const text = await res.text();
    const rawPreview = text.slice(0, 700);
    let parsedAs = 'none';
    let data = null;

    if (status === 401 || status === 403) {
      addLog(`SHAREPOINT_AUTH_FAILURE ${JSON.stringify({ title, endpoint, status, statusText })}`, 'legacy][CREATE_LIBRARIES][REST');
      throw legacyPipelineFailure({
        boundary: 'CREATE_LIBRARIES',
        operation: 'authenticate-library-read',
        target: endpoint,
        method: 'GET',
        status,
        responsePreview: `SHAREPOINT_AUTH_FAILURE | ${rawPreview}`,
        reason: 'SHAREPOINT_AUTH_FAILURE',
        nextAction: 'Open the Bootstrap URL in an authenticated SharePoint browser session and retry.',
      });
    }

    if (status === 404) {
      addLog(`library check result ${JSON.stringify({ title, endpoint, status, statusText, contentType, parsedAs: 'none', exists: false })}`, 'legacy][CREATE_LIBRARIES][REST');
      return { exists: false, status, contentType, parsedAs: 'none', rawPreview };
    }

    if (status === 200) {
      if (contentType.includes('json')) {
        try {
          data = text ? JSON.parse(text) : {};
          parsedAs = 'json';
        } catch {
          parsedAs = 'text';
        }
      } else if (contentType.includes('xml') || looksHtml(text) || /^\s*</.test(text)) {
        parsedAs = contentType.includes('xml') ? 'xml' : 'text';
      } else {
        try {
          data = text ? JSON.parse(text) : {};
          parsedAs = 'json';
        } catch {
          parsedAs = 'text';
        }
      }
      if (parsedAs === 'xml') {
        addLog('Library exists but SharePoint returned Atom/XML instead of JSON');
      }
      const classification = classifySharePointLibraryResponse({
        status,
        payload: data,
        title,
        expectedRootUrl: title === cfg.usersDb ? cfg.usersDbRoot : cfg.siteDbRoot,
        parsedAs,
      });
      addLog(`library check result ${JSON.stringify({ title, endpoint, status, statusText, contentType, parsedAs, exists: classification.exists, BaseTemplate: classification.baseTemplate, RootFolder: classification.rootFolder, isDocumentLibrary: classification.isDocumentLibrary, readinessReason: classification.reason, rawPreview: parsedAs === 'json' ? undefined : rawPreview })}`, 'legacy][CREATE_LIBRARIES][REST');
      return { ...classification, status, contentType, parsedAs, rawPreview };
    }

    throw new Error(`Library check failed for ${title}: HTTP ${status} ${statusText}. Preview: ${rawPreview}`);
  };

  const readAllLibraries = async (webUrl) => {
    const url = `${webUrl}/_api/web/lists?$select=Id,Title,BaseTemplate,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,OnQuickLaunch&$expand=RootFolder`;
    const res = await logRequest({ url, purpose: 'library-root-collision-check' });
    const parsed = await readResponseSafely(res, { url });
    return unwrapSharePointODataCollection(parsed);
  };

  const sharePointFilesystemOptions = (webUrl) => ({
    webUrl,
    siteRoot: cfg.siteRoot,
    libraries: [
      { title: cfg.siteDb, rootRel: cfg.siteDbRoot },
      { title: cfg.usersDb, rootRel: cfg.usersDbRoot },
    ],
    request: logRequest,
    log: (message) => addLog(message, 'legacy][SHAREPOINT_FILESYSTEM'),
  });

  const folderExists = async (webUrl, rel) => {
    const probe = await probeSharePointFolder({
      ...sharePointFilesystemOptions(webUrl),
      folderRel: rel,
      purpose: 'folder-check',
    });
    return probe.ready;
  };

  // Bootstrap status refresh is observational only. A brand-new logical site
  // does not have final dist/index yet, and old SharePoint can report that
  // absence as HTTP 400 FileNotFound instead of 404. Never block provisioning
  // on that expected pre-provisioning state. Authentication and unrelated
  // transport failures still propagate.
  const fileExists = async (webUrl, rel) => {
    try {
      const result = await readSharePointFileBytes({
        ...sharePointFilesystemOptions(webUrl),
        fileRel: rel,
        purpose: 'file-check',
        cacheKey: Date.now(),
      });
      return result.exists;
    } catch (error) {
      const status = Number(error?.details?.status || 0);
      if (error?.code === 'FILE_READ_FAILED' && (status === 400 || status === 404)) {
        addLog(`non-blocking Bootstrap status probe | file=${rel} | status=${status} | treatedAs=missing`, 'legacy][BOOTSTRAP_STATUS');
        return false;
      }
      throw error;
    }
  };

  const refreshSetupStatus = async () => {
    setLatestStep('רענון סטטוס');
    addLog('status refresh started');
    const webUrl = resolveCurrentSharePointWebUrl();
    const [siteDbCheck, usersDbCheck, distOk, assetsOk, imagesOk, indexOk, siteAssetsOk] = await Promise.all([
      checkLibraryExists(webUrl, cfg.siteDb),
      checkLibraryExists(webUrl, cfg.usersDb),
      folderExists(webUrl, cfg.finalDistRoot),
      folderExists(webUrl, `${cfg.finalDistRoot}/assets`),
      folderExists(webUrl, `${cfg.finalDistRoot}/images`),
      fileExists(webUrl, `${cfg.finalDistRoot}/index.html`),
      folderExists(webUrl, cfg.siteAssetsRoot),
    ]);
    setState((p) => ({
      ...p,
      webUrl,
      bootstrapPath: cfg.bootstrapDistRoot,
      finalPath: cfg.finalDistRoot,
      finalAppUrl: cfg.finalAppUrl,
      siteDb: siteDbCheck.exists ? 'exists' : 'waiting',
      usersDb: usersDbCheck.exists ? 'exists' : 'waiting',
      dist: distOk ? 'exists' : 'waiting',
      siteAssets: siteAssetsOk ? 'exists' : 'waiting',
      images: imagesOk ? 'exists' : p.images,
      finalIndex: indexOk ? 'exists' : 'waiting',
    }));
    addLog(`status refresh result | siteDb=${siteDbCheck.exists} usersDb=${usersDbCheck.exists} dist=${distOk} assets=${assetsOk} index=${indexOk}`);
  };

  const getDigest = async (webUrl) => {
    const url = `${webUrl}/_api/contextinfo`;
    const res = await logRequest({ url, method: 'POST', purpose: 'contextinfo', headers: { Accept: ODATA_ACCEPT, 'Content-Type': ODATA_CONTENT } });
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
    const digest = parsed?.d?.GetContextWebInformation?.FormDigestValue || '';
    if (!res.ok || !digest) {
      throw legacyPipelineFailure({
        boundary: 'SHAREPOINT_CONTEXTINFO', operation: 'request-form-digest', target: url,
        method: 'POST', status: res.status, responsePreview: text.slice(0, 500),
        nextAction: 'Confirm the browser session is authenticated to this SharePoint web, then retry.',
      });
    }
    addLog(`contextinfo success | status=${res.status} | content-type=${res.headers.get('content-type') || ''}`);
    return digest;
  };

  const ensureLibrary = async (webUrl, title, digest, key) => {
    setState((p) => ({ ...p, [key]: 'checking' }));
    const configuredRoot = title === cfg.usersDb ? cfg.usersDbRoot : cfg.siteDbRoot;
    let exact;
    try {
      exact = await ensureExactSharePointLibrary({
        siteRoot: cfg.siteRoot,
        configuredTitle: title,
        expectedRoot: configuredRoot,
        readByTitle: async () => {
          const check = await checkLibraryExists(webUrl, title);
          return check.status === 404 ? null : check.record;
        },
        readAllLibraries: () => readAllLibraries(webUrl),
        createWithExactUrl: async ({ title: exactTitle, siteRelativeUrl }) => {
          addLog(`creating exact library ${JSON.stringify({ title: exactTitle, expectedRoot: configuredRoot, siteRelativeUrl, api: 'SP.ListCreationInformation' })}`, 'legacy][CREATE_LIBRARIES][JSOM');
          return createDocumentLibraryWithExactUrl({ webUrl, title: exactTitle, siteRelativeUrl });
        },
      });
    } catch (error) {
      if (Object.values(EXACT_LIBRARY_ERRORS).includes(error?.code)) {
        const allocationFailure = error.code === EXACT_LIBRARY_ERRORS.ALLOCATION_FAILED;
        throw legacyPipelineFailure({
          boundary: 'CREATE_LIBRARIES',
          operation: 'ensure-exact-library-root',
          target: title,
          reason: error.code,
          responsePreview: [
            `CONFIGURED TITLE: ${error.configuredTitle || title}`,
            `EXPECTED ROOT: ${error.expectedRoot || configuredRoot}`,
            `ACTUAL ROOT: ${error.actualRoot || '(missing)'}`,
            `BASE TEMPLATE: ${error.baseTemplate ?? 'unknown'}`,
            `LIST ID: ${error.actualListId || '(unknown)'}`,
            `ACTUAL TITLE: ${error.actualTitle || '(unknown)'}`,
          ].join('\n'),
          nextAction: allocationFailure
            ? 'SharePoint did not allocate the explicitly requested library URL. Choose an unused library URL or remove the conflicting SharePoint object manually after confirming it is safe.'
            : 'Choose an unused library URL or remove the conflicting SharePoint object manually after confirming it is safe.',
        }, error);
      }
      throw error;
    }

    const list = exact.record;
    const rootRel = list?.RootFolder?.ServerRelativeUrl || configuredRoot;
    await waitForSharePointFolder({
      ...sharePointFilesystemOptions(webUrl),
      folderRel: rootRel,
      purpose: `library-rest-readiness-${title}`,
    });
    setState((p) => ({ ...p, [key]: exact.created ? 'created' : 'exists' }));
    addLog(`${exact.outcome} ${JSON.stringify({ title, expectedRoot: configuredRoot, actualRoot: rootRel, listId: list?.Id, BaseTemplate: list?.BaseTemplate })}`, 'legacy][CREATE_LIBRARIES][REST');
    const mergeUrl = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${esc(rootRel)}')`;
    const mergeRes = await logRequest({
      url: mergeUrl, method: 'POST', purpose: `welcome-${title}`,
      headers: { 'X-RequestDigest': digest, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' },
      body: JSON.stringify({ __metadata: { type: 'SP.Folder' }, WelcomePage: 'Forms/AllItems.aspx' }),
    });
    await readResponseSafely(mergeRes, { url: mergeUrl });
    addLog(`library create/check result | ${title} | outcome=${exact.outcome || EXACT_LIBRARY_OUTCOMES.REUSE} | Id=${list?.Id ?? 'unknown'} | Title=${list?.Title ?? title} | BaseTemplate=${list?.BaseTemplate ?? 'unknown'} | RootFolder.ServerRelativeUrl=${rootRel}`);
    return { ok: true, existed: !exact.created, created: exact.created, title, rootRel, listId: list?.Id };
  };

  const ensureFolder = async (webUrl, rel, digest, key) => {
    if (key) setState((p) => ({ ...p, [key]: 'checking' }));
    try {
      const result = await ensureSharePointFolder({
        ...sharePointFilesystemOptions(webUrl),
        folderRel: rel,
        digest,
      });
      if (key) setState((p) => ({ ...p, [key]: result.created ? 'created' : 'exists' }));
      addLog(`folder ensure result | ${rel} | created=${result.created} | existed=${result.existed}`);
      return result;
    } catch (error) {
      throw legacyPipelineFailure({
        boundary: 'CREATE_FOLDERS',
        operation: 'ensure-list-backed-folder',
        target: rel,
        reason: error?.code || error?.message || 'SharePoint folder readiness failed',
        responsePreview: JSON.stringify(error?.details || {}).slice(0, 700),
        nextAction: 'Retry CREATE_FOLDERS. The setup waits until SharePoint exposes the folder as a real writable list item.',
      }, error);
    }
  };

  const ensureTextFileIfMissing = async (webUrl, rel, content, digest) => {
    setState((p) => ({ ...p, txtFiles: 'checking' }));
    const filesystem = sharePointFilesystemOptions(webUrl);
    const existing = await readSharePointFileBytes({
      ...filesystem,
      fileRel: rel,
      purpose: 'txt-read',
      cacheKey: Date.now(),
    });
    if (existing.exists) {
      const txt = new TextDecoder().decode(existing.bytes);
      if (classifyTxtSeed({ status: existing.status, text: txt }) === 'preserve') {
        addLog(`TXT kept | ${rel}`);
        setState((p) => ({ ...p, txtFiles: 'exists' }));
        return { path: rel, outcome: 'preserved' };
      }
    }

    const folder = rel.slice(0, rel.lastIndexOf('/'));
    const fileName = rel.split('/').pop();
    await ensureFolder(webUrl, folder, digest);
    const bytes = new TextEncoder().encode(`${content}\n`);
    await uploadSharePointFileBytes({
      ...filesystem,
      folderRel: folder,
      fileName,
      bytes,
      digest,
      contentType: 'text/plain; charset=utf-8',
    });

    const verified = await readSharePointFileBytes({
      ...filesystem,
      fileRel: rel,
      purpose: 'txt-verify',
      cacheKey: `${Date.now()}-verify`,
    });
    if (!verified.exists) {
      throw legacyPipelineFailure({
        boundary: 'CREATE_TXT_SEEDS', operation: 'verify-seed-upload', target: rel, status: 404,
        nextAction: 'Retry CREATE_TXT_SEEDS; SharePoint did not expose the uploaded seed file yet.',
      });
    }
    const expectedSha256 = await sha256Bytes(bytes);
    const actualSha256 = await sha256Bytes(verified.bytes);
    if (verified.bytes.byteLength !== bytes.byteLength || actualSha256 !== expectedSha256) {
      throw legacyPipelineFailure({
        boundary: 'CREATE_TXT_SEEDS', operation: 'verify-seed-content', target: rel,
        expectedSize: bytes.byteLength, actualSize: verified.bytes.byteLength,
        expectedSha256, actualSha256,
        nextAction: 'Retry CREATE_TXT_SEEDS; SharePoint returned content different from the uploaded seed.',
      });
    }
    addLog(`TXT created + verified | ${rel} | bytes=${bytes.byteLength}`);
    setState((p) => ({ ...p, txtFiles: 'created' }));
    return { path: rel, outcome: 'created' };
  };

  const buildFileValueUrl = (webUrl, rel, cacheKey = '') => {
    const query = cacheKey ? `?siteBuilderBuild=${encodeURIComponent(cacheKey)}` : '';
    return `${webUrl}/_api/web/GetFileByServerRelativeUrl('${esc(rel)}')/$value${query}`;
  };
  const sha256Bytes = async (bytes) => {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable; final deployment cannot be verified safely.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, '0')).join('');
  };
  const deploymentFailure = (context) => legacyPipelineFailure({
    ...context,
    boundary: context.boundary,
    operation: context.operation || context.phase,
    currentFile: context.currentFile || context.path,
    nextAction: context.nextAction || `Retry ${context.boundary} after inspecting the reported file and response.`,
  });

  const fetchAndVerifyFile = async ({ webUrl, rootRel, entry, buildId, boundary, operation }) => {
    const serverRelativePath = `${rootRel}/${entry.path}`;
    const url = buildFileValueUrl(webUrl, serverRelativePath, `${buildId}-${Date.now()}`);
    const response = await logRequest({ url, purpose: `${boundary}-${operation}-${entry.path}` });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const preview = (await response.text()).slice(0, 500);
      throw deploymentFailure({ boundary, operation, buildId, path: entry.path, source: serverRelativePath, target: url, method: 'GET', status: response.status, contentType, responsePreview: preview, expectedSize: entry.size, expectedSha256: entry.sha256 });
    }
    const bytes = await response.arrayBuffer();
    const actualSize = bytes.byteLength;
    const actualSha256 = await sha256Bytes(bytes);
    if (actualSize !== entry.size || actualSha256 !== entry.sha256) {
      throw deploymentFailure({ boundary, operation, buildId, path: entry.path, source: serverRelativePath, target: url, method: 'GET', status: response.status, contentType, expectedSize: entry.size, actualSize, expectedSha256: entry.sha256, actualSha256 });
    }
    return bytes;
  };

  const uploadFile = async ({ webUrl, digest, rootRel, entry, bytes, buildId, boundary, operation }) => {
    const target = `${rootRel}/${entry.path}`;
    const targetFolder = target.slice(0, target.lastIndexOf('/'));
    const fileName = target.split('/').pop();
    try {
      await uploadSharePointFileBytes({
        ...sharePointFilesystemOptions(webUrl),
        folderRel: targetFolder,
        fileName,
        bytes,
        digest,
        contentType: 'application/octet-stream',
      });
    } catch (error) {
      throw deploymentFailure({
        boundary, operation, buildId, path: entry.path, source: cfg.bootstrapDistRoot, target, method: 'POST',
        responsePreview: JSON.stringify(error?.details || {}).slice(0, 700),
        expectedSize: entry.size, expectedSha256: entry.sha256,
        reason: error?.code || error?.message || 'SharePoint asset upload failed',
      });
    }
  };

  const preflightSource = async (webUrl) => {
    addLog('Boundary B source preflight started; final dist will not be touched until it passes.', 'sharepoint-final-copy');
    setCopyStats((p) => ({ ...p, manifestUrl: cfg.manifestAbs }));
    const manifestUrl = buildFileValueUrl(webUrl, cfg.manifestRel, Date.now());
    const manifestResponse = await logRequest({ url: manifestUrl, purpose: 'boundary-b-manifest-load' });
    const manifestContentType = manifestResponse.headers.get('content-type') || '';
    const manifestText = await manifestResponse.text();
    if (!manifestResponse.ok) {
      throw deploymentFailure({ boundary: 'BOOTSTRAP_PAGE_LOAD', operation: 'load-bootstrap-manifest', buildId: '', path: 'sharepoint-deploy-manifest.json', source: cfg.manifestRel, target: manifestUrl, method: 'GET', status: manifestResponse.status, contentType: manifestContentType, responsePreview: manifestText.slice(0, 500) });
    }
    let manifest;
    try {
      manifest = normalizeAtomicBuildManifest(JSON.parse(manifestText));
    } catch (error) {
      throw deploymentFailure({ boundary: 'BOOTSTRAP_PAGE_LOAD', operation: 'parse-bootstrap-manifest', buildId: '', path: 'sharepoint-deploy-manifest.json', source: cfg.manifestRel, target: manifestUrl, method: 'GET', status: manifestResponse.status, contentType: manifestContentType, responsePreview: manifestText.slice(0, 500), reason: error.message });
    }
    addLog(`buildId=${manifest.buildId}; Source verification: 0 / ${manifest.files.length}`, 'sharepoint-final-copy');
    setCopyStats((p) => ({ ...p, buildId: manifest.buildId, manifestCount: manifest.files.length, copied: 0, verified: 0, failed: 0, mismatched: 0 }));
    const sourceBytes = new Map();
    for (let index = 0; index < manifest.files.length; index += 1) {
      const entry = manifest.files[index];
      const bytes = await fetchAndVerifyFile({ webUrl, rootRel: cfg.bootstrapDistRoot, entry, buildId: manifest.buildId, boundary: 'BOOTSTRAP_PAGE_LOAD', operation: 'verify-bootstrap-file' });
      sourceBytes.set(entry.path, bytes);
      addLog(`Source verification: ${index + 1} / ${manifest.files.length} — ${entry.path}`, 'sharepoint-final-copy');
    }
    const indexBytes = sourceBytes.get('index.html');
    const indexHtml = new TextDecoder().decode(indexBytes);
    const indexReferences = assertIndexReferencesMatchManifest(manifest, indexHtml);
    const requiredCss = indexReferences.filter((reference) => /\.css$/i.test(reference));
    const requiredJs = indexReferences.filter((reference) => /\.js$/i.test(reference));
    if (!requiredJs.length || !requiredCss.length) {
      throw deploymentFailure({ boundary: 'BOOTSTRAP_PAGE_LOAD', operation: 'validate-bootstrap-index-references', buildId: manifest.buildId, path: 'index.html', source: cfg.bootstrapDistRoot, reason: 'index.html must reference at least one local JS and CSS asset.' });
    }
    return { manifest, sourceBytes, indexReferences, manifestText };
  };

  const copyFromBootstrapToFinal = async (webUrl, digest, source) => {
    setState((p) => ({ ...p, copyFiles: 'copying', finalIndex: 'waiting' }));
    setLatestStep('מאמת ומעתיק את קבצי האתר');
    const { manifest, sourceBytes, indexReferences, manifestText } = source;
    const copied = [];
    try {
      const orderedFiles = orderFilesForAtomicDeployment(manifest.files);
      const manifestBytes = new TextEncoder().encode(manifestText).buffer;
      const manifestEntry = { path: 'sharepoint-deploy-manifest.json', size: manifestBytes.byteLength, sha256: await sha256Bytes(manifestBytes) };
      const indexEntry = manifest.files.find((entry) => entry.path === 'index.html');
      sourceBytes.set(manifestEntry.path, manifestBytes);
      const deploymentEntries = [...orderedFiles, manifestEntry, indexEntry];
      const stagedManifest = { ...manifest, targetRoot: cfg.finalDistRoot };
      await runFinalAssetStages({
        manifest: stagedManifest,
        deploymentEntries,
        skipFolderStage: true,
        ensureFolder: (folder) => ensureFolder(webUrl, folder, digest),
        uploadFile: async (entry) => {
          await uploadFile({ webUrl, digest, rootRel: cfg.finalDistRoot, entry, bytes: sourceBytes.get(entry.path), buildId: manifest.buildId, boundary: 'FINAL_ASSET_COPY', operation: 'upload-final-asset' });
          copied.push(entry.path);
          setCopyStats((p) => ({ ...p, copied: copied.length }));
        },
        verifyFile: async (entry) => {
          await fetchAndVerifyFile({ webUrl, rootRel: cfg.finalDistRoot, entry, buildId: manifest.buildId, boundary: 'FINAL_ASSET_VERIFY', operation: 'verify-final-asset' });
          setCopyStats((p) => ({ ...p, verified: p.verified + 1 }));
        },
        commitIndex: async (entry) => uploadFile({ webUrl, digest, rootRel: cfg.finalDistRoot, entry, bytes: sourceBytes.get(entry.path), buildId: manifest.buildId, boundary: 'FINAL_INDEX_COMMIT', operation: 'commit-index-last' }),
        verifyIndex: async (entry) => {
          const finalIndexBytes = await fetchAndVerifyFile({ webUrl, rootRel: cfg.finalDistRoot, entry, buildId: manifest.buildId, boundary: 'FINAL_INDEX_VERIFY', operation: 'verify-final-index' });
          const finalReferences = assertIndexReferencesMatchManifest(manifest, new TextDecoder().decode(finalIndexBytes));
          for (const reference of finalReferences) {
            const referencedEntry = manifest.files.find((file) => file.path === reference);
            await fetchAndVerifyFile({ webUrl, rootRel: cfg.finalDistRoot, entry: referencedEntry, buildId: manifest.buildId, boundary: 'FINAL_INDEX_VERIFY', operation: 'verify-index-reference' });
          }
        },
        smoke: async () => {
          const smokeUrl = `${cfg.finalAppUrl}?siteBuilderBuild=${encodeURIComponent(manifest.buildId)}-${Date.now()}`;
          const response = await logRequest({ url: smokeUrl, purpose: 'final-app-static-smoke' });
          if (!response.ok) {
            throw deploymentFailure({ boundary: 'FINAL_APP_SMOKE', operation: 'fetch-final-app', target: smokeUrl, method: 'GET', status: response.status, responsePreview: (await response.text()).slice(0, 500), buildId: manifest.buildId });
          }
          addLog(`FINAL_APP_SMOKE: STATIC PASS | finalUrl=${cfg.finalAppUrl} | references=${indexReferences.length}`, 'legacy][FINAL_APP_SMOKE');
          return 'STATIC PASS';
        },
        onStage: (stage, stageStatus) => setLegacyStage(stage, stageStatus, { buildId: manifest.buildId }),
        stageRunner: runStage,
        onProgress: (stage, current, total, currentFile) => addLog(`${stage}: ${current}/${total} ${currentFile}`, `legacy][${stage}`),
      });
      setDetails((p) => ({ ...p, copiedFiles: [...p.copiedFiles, ...copied, 'index.html'] }));
      setCopyStats((p) => ({ ...p, finalIndex: true, finalAssets: true }));
      setState((p) => ({ ...p, copyFiles: 'done', finalIndex: 'done', dist: 'done' }));
      return { complete: true, buildId: manifest.buildId };
    } catch (error) {
      setDetails((p) => ({ ...p, copiedFiles: [...p.copiedFiles, ...copied], failedFiles: [...p.failedFiles, { file: 'atomic-final-copy', reason: error.message }] }));
      setCopyStats((p) => ({
        ...p,
        copied: copied.length,
        verified: copied.length,
        failed: p.failed + 1,
        mismatched: p.mismatched + (error?.legacyFailure?.actualSha256 || error?.legacyFailure?.actualSize !== undefined ? 1 : 0),
      }));
      setState((p) => ({ ...p, copyFiles: copied.length ? 'partial' : 'failed', finalIndex: 'failed' }));
      throw error;
    }
  };

  const runSetup = async () => {
    addRunSeparator();
    setStatus('running');
    setErrorInfo(null);
    setLatestStep('מתחיל הקמה');
    try {
      writeLegacyProvisioningStatus(LEGACY_PROVISIONING_STATUSES.IN_PROGRESS);
      await refreshSetupStatus();
      const webUrl = resolveCurrentSharePointWebUrl();
      const source = await runStage('BOOTSTRAP_PAGE_LOAD', 'load-and-verify-bootstrap-page', () => preflightSource(webUrl), {
        source: window.location.href,
        target: cfg.bootstrapDistRoot,
      });
      addLog(`BOOTSTRAP_PAGE_LOAD: SUCCESS | browserUrl=${window.location.href} | canonicalSiteRoot=${cfg.siteRoot} | bootstrapRoot=${cfg.bootstrapDistRoot} | buildId=${source.manifest.buildId}`, 'legacy][BOOTSTRAP_PAGE_LOAD');

      const digest = await runStage('SHAREPOINT_CONTEXTINFO', 'request-form-digest', () => getDigest(webUrl), { target: `${webUrl}/_api/contextinfo`, method: 'POST', buildId: source.manifest.buildId });

      await runStage('CREATE_LIBRARIES', 'ensure-configured-libraries', async () => {
        await ensureLibrary(webUrl, cfg.siteDb, digest, 'siteDb');
        await ensureLibrary(webUrl, cfg.usersDb, digest, 'usersDb');
        const permissionResult = await ensureUsersDbFolderPermissionsReady();
        if (!permissionResult?.ok) {
          throw legacyPipelineFailure({
            boundary: 'CREATE_LIBRARIES',
            operation: 'configure-users-db-permissions',
            target: cfg.usersDbRoot,
            status: permissionResult?.technicalError?.status,
            responsePreview: JSON.stringify(permissionResult?.technicalError || permissionResult || {}).slice(0, 700),
            reason: permissionResult?.status || 'permissions-setup-failed',
            nextAction: 'Retry CREATE_LIBRARIES from this authenticated SharePoint setup page.',
          });
        }
        addLog(`users DB permissions ready | status=${permissionResult.status} | folder=${permissionResult.folderUrl || cfg.usersDbRoot}`, 'legacy][CREATE_LIBRARIES][PERMISSIONS');
      }, { source: cfg.siteRoot, target: `${cfg.siteDbRoot},${cfg.usersDbRoot}`, buildId: source.manifest.buildId });

      await runStage('CREATE_FOLDERS', 'ensure-configured-and-manifest-folders', async () => {
        await ensureFolder(webUrl, cfg.siteAssetsRoot, digest, 'siteAssets');
        await ensureFolder(webUrl, cfg.imagesRoot, digest, 'images');
        for (const folder of deriveRequiredFolders(cfg.finalDistRoot, source.manifest.files)) {
          await ensureFolder(webUrl, folder, digest, folder === cfg.finalDistRoot ? 'dist' : undefined);
        }
      }, { source: cfg.siteDbRoot, target: cfg.finalDistRoot, buildId: source.manifest.buildId });

      await runStage('CREATE_TXT_SEEDS', 'create-missing-seeds', async () => {
        const seeds = [
          [cfg.masterConfigFileServerRelativeUrl, JSON.stringify(buildInitialMasterConfig(), null, 2)],
          [cfg.usersFileServerRelativeUrl, JSON.stringify([], null, 2)],
          [cfg.eventsFileServerRelativeUrl, JSON.stringify({ displayCount: 3, displayMode: 'default', events: [] }, null, 2)],
          [cfg.navigationFileServerRelativeUrl, JSON.stringify([], null, 2)],
          [cfg.siteContentFileServerRelativeUrl, JSON.stringify({}, null, 2)],
          [cfg.themeFileServerRelativeUrl, JSON.stringify({}, null, 2)],
          [cfg.externalLinksFileServerRelativeUrl, JSON.stringify([], null, 2)],
          [cfg.ganttFileServerRelativeUrl, JSON.stringify(DEFAULT_GANTT_DATA, null, 2)],
          [cfg.boomFileServerRelativeUrl, JSON.stringify(createInitialBoomData(), null, 2)],
          [cfg.widgetsFileServerRelativeUrl, JSON.stringify({}, null, 2)],
        ];
        const outcomes = [];
        for (const [path, content] of seeds) outcomes.push(await ensureTextFileIfMissing(webUrl, path, content, digest));
        addLog(`CREATE_TXT_SEEDS summary | created=${outcomes.filter((item) => item.outcome === 'created').length} | preserved=${outcomes.filter((item) => item.outcome === 'preserved').length} | failed=0`, 'legacy][CREATE_TXT_SEEDS');
      }, { target: `${cfg.siteAssetsRoot},${cfg.usersDbRoot}`, buildId: source.manifest.buildId });

      await copyFromBootstrapToFinal(webUrl, digest, source);
      await refreshSetupStatus();

      setLegacyStage('COMPLETE', 'running', { buildId: source.manifest.buildId, finalAppUrl: cfg.finalAppUrl });
      writeLegacyProvisioningStatus(LEGACY_PROVISIONING_STATUSES.COMPLETE);
      setLegacyStage('COMPLETE', 'passed', { buildId: source.manifest.buildId, finalAppUrl: cfg.finalAppUrl });
      setStatus('done');
      setLatestStep('הקמה הושלמה');
      addLog(`LEGACY PIPELINE: COMPLETE | FINAL APP URL: ${cfg.finalAppUrl}`, 'legacy][COMPLETE');
      addLog(`final URL: ${cfg.finalAppUrl}`);
    } catch (error) {
      setStatus('error');
      if (/manifest/i.test(String(error?.message || ''))) {
        setState((p) => ({ ...p, copyFiles: 'failed', finalIndex: 'failed' }));
      }
      const failure = error instanceof LegacyPipelineError
        ? error.legacyFailure
        : normalizeLegacyFailure({ boundary: activeStageRef.current, operation: 'browser-setup-stage', reason: error.message, nextAction: `Retry ${activeStageRef.current} after inspecting this diagnostic.` });
      setStageState((previous) => ({ ...previous, [failure.boundary]: 'failed' }));
      const diagnostic = formatLegacyFailure(failure);
      setErrorInfo({ title: 'ההקמה נכשלה', step: failure.boundary, reason: failure.reason || error.message, diagnostic });
      addLog(`setup failure\n${diagnostic}`, `legacy][${failure.boundary}`);
      await refreshSetupStatus().catch(() => {});
    }
  };

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    const webUrl = resolveCurrentSharePointWebUrl();
    refreshSetupStatus()
      .then(() => runStage('BOOTSTRAP_PAGE_LOAD', 'initial-bootstrap-page-load', () => preflightSource(webUrl), { source: window.location.href, target: cfg.bootstrapDistRoot }))
      .then((source) => addLog(`BOOTSTRAP_PAGE_LOAD: SUCCESS | browserUrl=${window.location.href} | canonicalSiteRoot=${cfg.siteRoot} | bootstrapRoot=${cfg.bootstrapDistRoot} | buildId=${source.manifest.buildId}`, 'legacy][BOOTSTRAP_PAGE_LOAD'))
      .catch((error) => {
        const failure = error instanceof LegacyPipelineError ? error.legacyFailure : normalizeLegacyFailure({ boundary: 'BOOTSTRAP_PAGE_LOAD', operation: 'initial-page-load', reason: error.message });
        setErrorInfo({ title: 'טעינת Bootstrap נכשלה', step: failure.boundary, reason: failure.reason || error.message, diagnostic: formatLegacyFailure(failure) });
      });
  // The bootstrap artifact is deliberately validated once when authorization becomes ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const copyLogs = async () => {
    try { await navigator.clipboard.writeText(logs.join('\n')); addLog('logs copied'); } catch { addLog('logs copy failed'); }
  };
  const clearLogs = () => setLogs([]);

  const statusItems = [
    ['siteDB', state.siteDb],
    ['siteUsersDb', state.usersDb],
    ['dist', state.dist],
    ['siteAssets', state.siteAssets],
    ['images', state.images],
    ['index.html', state.finalIndex],
    ['קבצי TXT', state.txtFiles],
    ['העתקת קבצי האתר', state.copyFiles],
  ];

  if (authLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-100 text-slate-900 p-8 font-heebo">
        טוען הרשאות...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-100 text-slate-900 p-8 font-heebo">
        אין הרשאה לפתיחת מסך הקמת SharePoint.
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 text-slate-900 p-4 md:p-8 font-heebo">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h1 className="text-2xl font-bold">הקמת SharePoint לאתר חדש</h1>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h2 className="text-lg font-semibold">מצב הקמה</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {statusItems.map(([label, st]) => (
              <div key={label} className={`border rounded-md p-3 ${badgeClass(st)}`}>
                <div className="font-semibold">{label}</div>
                <div className="text-sm">{LABELS[st] || LABELS.waiting}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3" dir="ltr">
          <h2 className="text-lg font-semibold">Legacy pipeline stages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {LEGACY_PIPELINE_STAGES.map((stage) => (
              <div key={stage} className={`border rounded-md p-2 ${badgeClass(stageState[stage])}`}>
                <div className="font-mono text-xs font-semibold">{stage}</div>
                <div className="text-xs">{stageState[stage]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 text-sm space-y-1">
          <h2 className="text-lg font-semibold">פרטי יעד</h2>
          <div>Web URL: {state.webUrl || '...'}</div>
          <div>Bootstrap path: {cfg.bootstrapDistRoot}</div>
          <div>Final path: {cfg.finalDistRoot}</div>
          <div>Final app URL: {cfg.finalAppUrl}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h2 className="text-lg font-semibold">פעולות</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runSetup} disabled={status === 'running'} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {status === 'running' ? 'מבצע הקמה...' : 'הפעל הקמת SharePoint'}
            </button>
            {status === 'done' && state.copyFiles === 'done' && (
              <a href={cfg.finalAppUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">פתח את האתר הסופי</a>
            )}
          </div>
          {errorInfo && (
            <DismissibleNotice dismissKey={`${errorInfo.title}:${errorInfo.step}:${errorInfo.reason}`} className="rounded-md border border-red-300 bg-red-100 p-3 text-sm text-red-900">
              <div className="font-semibold">{errorInfo.title}</div>
              <div>שלב שנכשל: {errorInfo.step}</div>
              <div>סיבה: {errorInfo.reason}</div>
              {errorInfo.diagnostic && <pre dir="ltr" className="mt-2 whitespace-pre-wrap text-xs">{errorInfo.diagnostic}</pre>}
            </DismissibleNotice>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <button type="button" onClick={() => setShowLogs((v) => !v)} className="w-full text-right font-semibold">פרטי לוג טכניים</button>
          <div className="text-sm mt-2">latest step: {latestStep}</div>
          <div className="text-xs mt-1">manifest URL: {copyStats.manifestUrl || '—'}</div>
          <div className="text-xs">build ID: {copyStats.buildId || '—'}</div>
          <div className="text-xs">manifest file count: {copyStats.manifestCount}</div>
          <div className="text-xs">copied: {copyStats.copied} | verified: {copyStats.verified} | failed: {copyStats.failed} | mismatched: {copyStats.mismatched}</div>
          <div className="text-xs">final index: {copyStats.finalIndex ? 'ok' : 'missing'} | final assets: {copyStats.finalAssets ? 'ok' : 'missing'}</div>
          {showLogs && (
            <>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={copyLogs} className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">העתק לוגים</button>
                <button type="button" onClick={clearLogs} className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">נקה לוגים</button>
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div>copied files: {details.copiedFiles.length}</div>
                <div>failed files: {details.failedFiles.length}</div>
                <div>skipped files: {details.skippedFiles.length}</div>
              </div>
              <div className="mt-3 h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                {logs.map((line, i) => <div key={`${i}-${line.slice(0, 20)}`}>{line}</div>)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
