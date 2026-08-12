import React, { useEffect, useMemo, useState } from 'react';
import { resolveCurrentSharePointWebUrl } from '../utils/resolveCurrentSharePointWebUrl';
import { useAuth } from '../context/AuthContext';
import { spBootstrapLog } from '../utils/spAppLog';
import { DEFAULT_GANTT_DATA } from '../utils/ganttData';
import DismissibleNotice from '../components/DismissibleNotice';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import {
  assertIndexReferencesMatchManifest,
  normalizeAtomicBuildManifest,
  orderFilesForAtomicDeployment,
} from '../utils/atomicDeploymentManifest';

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

const LABELS = { waiting: 'ממתין', checking: 'בבדיקה', exists: 'קיים', created: 'נוצר', copying: 'מעתיק', partial: 'הועתק חלקית', failed: 'נכשל', done: 'הושלם' };
const badgeClass = (s) => {
  if (s === 'done' || s === 'created' || s === 'exists') return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (s === 'partial') return 'bg-amber-100 text-amber-900 border-amber-300';
  if (s === 'failed') return 'bg-red-100 text-red-900 border-red-300';
  if (s === 'copying' || s === 'checking') return 'bg-blue-100 text-blue-900 border-blue-300';
  return 'bg-slate-100 text-slate-900 border-slate-300';
};

export default function AdminSharePointSetupPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [latestStep, setLatestStep] = useState('ממתין');
  const [errorInfo, setErrorInfo] = useState(null);
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
      bootstrapLibrary, bootstrapFolder, targetDistPath, finalAppUrl,
    } = SHAREPOINT_PATHS;
    const siteDbLib = resolveLibraryConfig(siteDbRoot || siteDbFolder, siteDbFolder, siteRoot);
    const usersDbLib = resolveLibraryConfig(usersDbRoot || usersDbFolder, usersDbFolder, siteRoot);
    const bootstrapDistRoot = `${siteRoot}/${bootstrapLibrary}/${bootstrapFolder}/dist`;
    const finalDistRoot = targetDistPath || `${siteDbLib.rootRel}/dist`;
    return {
      host, siteCode, siteDb: siteDbLib.title, siteDbRoot: siteDbLib.rootRel, usersDb: usersDbLib.title, usersDbRoot: usersDbLib.rootRel,
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

  const logRequest = async ({ url, method = 'GET', purpose, headers, body }) => {
    const upperMethod = String(method || 'GET').toUpperCase();
    const isApi = String(url || '').includes('/_api/');
    const mergedHeaders = { ...(headers || {}) };
    if (isApi && !mergedHeaders.Accept) {
      mergedHeaders.Accept = ODATA_ACCEPT;
    }
    if (isApi && upperMethod !== 'GET' && upperMethod !== 'HEAD' && !mergedHeaders['Content-Type']) {
      mergedHeaders['Content-Type'] = ODATA_CONTENT;
    }
    const started = Date.now();
    const res = await fetch(url, { method: upperMethod, credentials: 'include', headers: mergedHeaders, body });
    const durationMs = Date.now() - started;
    const ct = res.headers.get('content-type') || '';
    addLog(`request ${method} ${url} | purpose=${purpose} | status=${res.status} | content-type=${ct} | durationMs=${durationMs}`);
    return res;
  };

  const getListByTitle = async (webUrl, title) => {
    const url = `${webUrl}/_api/web/lists/GetByTitle('${esc(title)}')?$select=BaseTemplate,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,DefaultViewUrl&$expand=RootFolder`;
    const res = await logRequest({ url, purpose: `list-${title}` });
    if (res.status === 404) return null;
    const parsed = await readResponseSafely(res, { url });
    return parsed?.d || null;
  };

  const checkLibraryExists = async (webUrl, title) => {
    const endpoint = `${webUrl}/_api/web/lists/GetByTitle('${esc(title)}')?$select=Id,Title,BaseTemplate,DefaultViewUrl,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,OnQuickLaunch&$expand=RootFolder`;
    const res = await logRequest({ url: endpoint, purpose: `library-check-${title}` });
    const contentType = res.headers.get('content-type') || '';
    const status = res.status;
    const statusText = res.statusText;
    const text = await res.text();
    const rawPreview = text.slice(0, 700);
    let parsedAs = 'none';
    let data = null;

    if (status === 404) {
      addLog(`library check result ${JSON.stringify({ title, endpoint, status, statusText, contentType, parsedAs: 'none', exists: false })}`);
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
      addLog(`library check result ${JSON.stringify({ title, endpoint, status, statusText, contentType, parsedAs, exists: true, rawPreview: parsedAs === 'json' ? undefined : rawPreview })}`);
      return { exists: true, status, contentType, parsedAs, data, rawPreview };
    }

    throw new Error(`Library check failed for ${title}: HTTP ${status} ${statusText}. Preview: ${rawPreview}`);
  };

  const folderExists = async (webUrl, rel) => {
    const url = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${esc(rel)}')?$select=ServerRelativeUrl`;
    const res = await logRequest({ url, purpose: `folder-check-${rel}` });
    if (res.status === 404) return false;
    await readResponseSafely(res, { url });
    return true;
  };

  const fileExists = async (url) => {
    const res = await logRequest({ url, purpose: `file-check-${url}` });
    return res.ok;
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
      fileExists(`${cfg.finalDistRoot}/index.html`),
      folderExists(webUrl, `${cfg.siteDbRoot}/siteAssets`),
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
    const parsed = await readResponseSafely(res, { url });
    const digest = parsed?.d?.GetContextWebInformation?.FormDigestValue || '';
    if (!digest) throw new Error('contextinfo returned empty digest');
    addLog('contextinfo success');
    return digest;
  };

  const ensureLibrary = async (webUrl, title, digest, key) => {
    setState((p) => ({ ...p, [key]: 'checking' }));
    const check = await checkLibraryExists(webUrl, title);
    if (check.exists) {
      setState((p) => ({ ...p, [key]: 'exists' }));
      addLog(`library already exists ${JSON.stringify({ title, status: check.status, contentType: check.contentType, parsedAs: check.parsedAs })}`);
      return { ok: true, existed: true, created: false, title };
    }

    if (check.status === 404) {
      const url = `${webUrl}/_api/web/lists`;
      const createBody = JSON.stringify({ __metadata: { type: 'SP.List' }, BaseTemplate: 101, Title: title, Description: 'Application system database library', OnQuickLaunch: true });
      const res = await logRequest({ url, method: 'POST', purpose: `create-library-${title}`, headers: { 'X-RequestDigest': digest }, body: createBody });
      if (!res.ok) {
        const errText = await res.text();
        const existsLikeError = res.status === 500 && /exist|already|name|שכבר|already exists|A list/i.test(errText);
        if (existsLikeError) {
          const recheck = await checkLibraryExists(webUrl, title);
          if (recheck.exists) {
            addLog('Create returned duplicate/existing library error; continuing because library exists.');
            setState((p) => ({ ...p, [key]: 'exists' }));
            return { ok: true, existed: true, created: false, title };
          }
        }
        throw new Error(`create library failed ${title} (${res.status}) ${errText.slice(0, 400)}`);
      }
      const recheck = await checkLibraryExists(webUrl, title);
      if (!recheck.exists) throw new Error(`library create verification failed: ${title}`);
      setState((p) => ({ ...p, [key]: 'created' }));
    }

    const list = await getListByTitle(webUrl, title);
    const rootRel = list?.RootFolder?.ServerRelativeUrl || `${cfg.siteDbRoot}`;
    const mergeUrl = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${esc(rootRel)}')`;
    const mergeRes = await logRequest({
      url: mergeUrl, method: 'POST', purpose: `welcome-${title}`,
      headers: { 'X-RequestDigest': digest, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' },
      body: JSON.stringify({ __metadata: { type: 'SP.Folder' }, WelcomePage: 'Forms/AllItems.aspx' }),
    });
    await readResponseSafely(mergeRes, { url: mergeUrl });
    addLog(`library create/check result | ${title} | BaseTemplate=${list?.BaseTemplate ?? 'unknown'} | DefaultViewUrl=${list?.DefaultViewUrl ?? 'unknown'} | RootFolder.ServerRelativeUrl=${rootRel}`);
  };

  const ensureFolder = async (webUrl, rel, digest, key) => {
    if (key) setState((p) => ({ ...p, [key]: 'checking' }));
    const url = `${webUrl}/_api/web/folders`;
    const res = await logRequest({
      url, method: 'POST', purpose: `folder-${rel}`,
      headers: { Accept: ODATA_ACCEPT, 'Content-Type': ODATA_CONTENT, 'X-RequestDigest': digest },
      body: JSON.stringify({ __metadata: { type: 'SP.Folder' }, ServerRelativeUrl: rel }),
    });
    if (res.ok || res.status === 409) {
      if (key) setState((p) => ({ ...p, [key]: res.status === 409 ? 'exists' : 'created' }));
      addLog(`folder ensure result | ${rel}`);
      return;
    }
    const text = await res.text();
    if (/already exists/i.test(text)) {
      if (key) setState((p) => ({ ...p, [key]: 'exists' }));
      return;
    }
    throw new Error(`folder create failed ${rel} (${res.status}) ${text.slice(0, 200)}`);
  };

  const ensureTextFileIfMissing = async (webUrl, rel, content, digest) => {
    setState((p) => ({ ...p, txtFiles: 'checking' }));
    const readRes = await logRequest({ url: rel, purpose: `txt-read-${rel}` });
    if (readRes.ok) {
      const txt = await readRes.text();
      if (txt.trim().length > 0) {
        addLog(`TXT kept | ${rel}`);
        setState((p) => ({ ...p, txtFiles: 'exists' }));
        return;
      }
    } else if (readRes.status !== 404) {
      throw new Error(`txt read failed ${rel} (${readRes.status})`);
    }
    const folder = rel.slice(0, rel.lastIndexOf('/'));
    await ensureFolder(webUrl, folder, digest);
    const fileName = rel.split('/').pop();
    const upUrl = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${esc(folder)}')/Files/add(url='${encodeURIComponent(fileName)}',overwrite=true)`;
    const upRes = await logRequest({ url: upUrl, method: 'POST', purpose: `txt-upload-${rel}`, headers: { Accept: ODATA_ACCEPT, 'Content-Type': 'text/plain; charset=utf-8', 'X-RequestDigest': digest }, body: `${content}\n` });
    await readResponseSafely(upRes, { url: upUrl });
    addLog(`TXT created | ${rel}`);
    setState((p) => ({ ...p, txtFiles: 'created' }));
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
  const deploymentFailure = (context) => {
    const error = new Error(`Atomic deployment verification failed: ${JSON.stringify(context)}`);
    error.deploymentDetails = context;
    return error;
  };

  const fetchAndVerifyFile = async ({ webUrl, rootRel, entry, buildId, boundary, phase }) => {
    const serverRelativePath = `${rootRel}/${entry.path}`;
    const url = buildFileValueUrl(webUrl, serverRelativePath, `${buildId}-${Date.now()}`);
    const response = await logRequest({ url, purpose: `${boundary}-${phase}-${entry.path}` });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const preview = (await response.text()).slice(0, 500);
      throw deploymentFailure({ boundary, phase, buildId, path: entry.path, method: 'GET', status: response.status, contentType, responsePreview: preview, expectedSize: entry.size, expectedSha256: entry.sha256 });
    }
    const bytes = await response.arrayBuffer();
    const actualSize = bytes.byteLength;
    const actualSha256 = await sha256Bytes(bytes);
    if (actualSize !== entry.size || actualSha256 !== entry.sha256) {
      throw deploymentFailure({ boundary, phase, buildId, path: entry.path, method: 'GET', status: response.status, contentType, expectedSize: entry.size, actualSize, expectedSha256: entry.sha256, actualSha256 });
    }
    return bytes;
  };

  const uploadAndVerifyFile = async ({ webUrl, digest, rootRel, entry, bytes, buildId, phase }) => {
    const target = `${rootRel}/${entry.path}`;
    const targetFolder = target.slice(0, target.lastIndexOf('/'));
    await ensureFolder(webUrl, targetFolder, digest);
    const fileName = target.split('/').pop();
    const url = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${esc(targetFolder)}')/Files/add(url='${encodeURIComponent(fileName)}',overwrite=true)`;
    const response = await logRequest({ url, method: 'POST', purpose: `boundary-b-${phase}-${entry.path}`, headers: { Accept: ODATA_ACCEPT, 'X-RequestDigest': digest }, body: bytes });
    if (!response.ok) {
      const preview = (await response.text()).slice(0, 500);
      throw deploymentFailure({ boundary: 'B', phase, buildId, path: entry.path, method: 'POST', status: response.status, contentType: response.headers.get('content-type') || '', responsePreview: preview, expectedSize: entry.size, expectedSha256: entry.sha256 });
    }
    await readResponseSafely(response, { url });
    await fetchAndVerifyFile({ webUrl, rootRel, entry, buildId, boundary: 'B', phase: `verify-${phase}` });
  };

  const preflightSource = async (webUrl) => {
    addLog('Boundary B source preflight started; final dist will not be touched until it passes.', 'sharepoint-final-copy');
    setCopyStats((p) => ({ ...p, manifestUrl: cfg.manifestAbs }));
    const manifestUrl = buildFileValueUrl(webUrl, cfg.manifestRel, Date.now());
    const manifestResponse = await logRequest({ url: manifestUrl, purpose: 'boundary-b-manifest-load' });
    const manifestContentType = manifestResponse.headers.get('content-type') || '';
    const manifestText = await manifestResponse.text();
    if (!manifestResponse.ok) {
      throw deploymentFailure({ boundary: 'B', phase: 'source-manifest', buildId: '', path: 'sharepoint-deploy-manifest.json', method: 'GET', status: manifestResponse.status, contentType: manifestContentType, responsePreview: manifestText.slice(0, 500) });
    }
    let manifest;
    try {
      manifest = normalizeAtomicBuildManifest(JSON.parse(manifestText));
    } catch (error) {
      throw deploymentFailure({ boundary: 'B', phase: 'source-manifest', buildId: '', path: 'sharepoint-deploy-manifest.json', method: 'GET', status: manifestResponse.status, contentType: manifestContentType, responsePreview: manifestText.slice(0, 500), reason: error.message });
    }
    addLog(`buildId=${manifest.buildId}; Source verification: 0 / ${manifest.files.length}`, 'sharepoint-final-copy');
    setCopyStats((p) => ({ ...p, buildId: manifest.buildId, manifestCount: manifest.files.length, copied: 0, verified: 0, failed: 0, mismatched: 0 }));
    const sourceBytes = new Map();
    for (let index = 0; index < manifest.files.length; index += 1) {
      const entry = manifest.files[index];
      const bytes = await fetchAndVerifyFile({ webUrl, rootRel: cfg.bootstrapDistRoot, entry, buildId: manifest.buildId, boundary: 'B', phase: 'source-preflight' });
      sourceBytes.set(entry.path, bytes);
      addLog(`Source verification: ${index + 1} / ${manifest.files.length} — ${entry.path}`, 'sharepoint-final-copy');
    }
    const indexBytes = sourceBytes.get('index.html');
    const indexHtml = new TextDecoder().decode(indexBytes);
    const indexReferences = assertIndexReferencesMatchManifest(manifest, indexHtml);
    const requiredCss = indexReferences.filter((reference) => /\.css$/i.test(reference));
    const requiredJs = indexReferences.filter((reference) => /\.js$/i.test(reference));
    if (!requiredJs.length || !requiredCss.length) {
      throw deploymentFailure({ boundary: 'B', phase: 'source-index-references', buildId: manifest.buildId, path: 'index.html', reason: 'index.html must reference at least one local JS and CSS asset.' });
    }
    return { manifest, sourceBytes, indexReferences, manifestText };
  };

  const copyFromBootstrapToFinal = async (webUrl, digest) => {
    setState((p) => ({ ...p, copyFiles: 'copying', finalIndex: 'waiting' }));
    setLatestStep('מאמת ומעתיק את קבצי האתר');
    const source = await preflightSource(webUrl);
    const { manifest, sourceBytes, indexReferences, manifestText } = source;
    const copied = [];
    try {
      const orderedFiles = orderFilesForAtomicDeployment(manifest.files);
      for (let index = 0; index < orderedFiles.length; index += 1) {
        const entry = orderedFiles[index];
        addLog(`Uploading: ${index + 1} / ${orderedFiles.length} — ${entry.path}`, 'sharepoint-final-copy');
        await uploadAndVerifyFile({ webUrl, digest, rootRel: cfg.finalDistRoot, entry, bytes: sourceBytes.get(entry.path), buildId: manifest.buildId, phase: 'non-entry' });
        copied.push(entry.path);
        setCopyStats((p) => ({ ...p, copied: copied.length, verified: copied.length }));
      }

      const manifestBytes = new TextEncoder().encode(manifestText).buffer;
      const manifestEntry = { path: 'sharepoint-deploy-manifest.json', size: manifestBytes.byteLength, sha256: await sha256Bytes(manifestBytes) };
      await uploadAndVerifyFile({ webUrl, digest, rootRel: cfg.finalDistRoot, entry: manifestEntry, bytes: manifestBytes, buildId: manifest.buildId, phase: 'manifest' });
      const finalManifestResponse = await logRequest({ url: buildFileValueUrl(webUrl, `${cfg.finalDistRoot}/sharepoint-deploy-manifest.json`, `${manifest.buildId}-${Date.now()}`), purpose: 'boundary-b-verify-final-manifest' });
      const finalManifestText = await finalManifestResponse.text();
      let finalManifest;
      try {
        finalManifest = finalManifestResponse.ok ? normalizeAtomicBuildManifest(JSON.parse(finalManifestText)) : null;
      } catch (error) {
        throw deploymentFailure({ boundary: 'B', phase: 'final-manifest', buildId: manifest.buildId, path: 'sharepoint-deploy-manifest.json', method: 'GET', status: finalManifestResponse.status, contentType: finalManifestResponse.headers.get('content-type') || '', responsePreview: finalManifestText.slice(0, 500), reason: error.message });
      }
      if (!finalManifestResponse.ok || finalManifest.buildId !== manifest.buildId) {
        throw deploymentFailure({ boundary: 'B', phase: 'final-manifest', buildId: manifest.buildId, path: 'sharepoint-deploy-manifest.json', method: 'GET', status: finalManifestResponse.status, contentType: finalManifestResponse.headers.get('content-type') || '', responsePreview: finalManifestText.slice(0, 500), actualBuildId: finalManifest?.buildId || '' });
      }

      const indexEntry = manifest.files.find((entry) => entry.path === 'index.html');
      addLog(`Committing index.html last for buildId=${manifest.buildId}`, 'sharepoint-final-copy');
      await uploadAndVerifyFile({ webUrl, digest, rootRel: cfg.finalDistRoot, entry: indexEntry, bytes: sourceBytes.get('index.html'), buildId: manifest.buildId, phase: 'commit-index-last' });

      for (let index = 0; index < indexReferences.length; index += 1) {
        const path = indexReferences[index];
        const entry = manifest.files.find((file) => file.path === path);
        addLog(`Verifying final: ${index + 1} / ${indexReferences.length} — ${path}`, 'sharepoint-final-copy');
        await fetchAndVerifyFile({ webUrl, rootRel: cfg.finalDistRoot, entry, buildId: manifest.buildId, boundary: 'B', phase: 'final-index-reference' });
      }
      setDetails((p) => ({ ...p, copiedFiles: [...p.copiedFiles, ...copied, 'sharepoint-deploy-manifest.json', 'index.html'] }));
      setCopyStats((p) => ({ ...p, copied: copied.length + 2, verified: copied.length + 2, finalIndex: true, finalAssets: true }));
      setState((p) => ({ ...p, copyFiles: 'done', finalIndex: 'done', dist: 'done' }));
      return { complete: true, buildId: manifest.buildId };
    } catch (error) {
      setDetails((p) => ({ ...p, copiedFiles: [...p.copiedFiles, ...copied], failedFiles: [...p.failedFiles, { file: 'atomic-final-copy', reason: error.message }] }));
      setCopyStats((p) => ({
        ...p,
        copied: copied.length,
        verified: copied.length,
        failed: p.failed + 1,
        mismatched: p.mismatched + (error?.deploymentDetails?.actualSha256 || error?.deploymentDetails?.actualSize !== undefined ? 1 : 0),
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
      await refreshSetupStatus();
      const webUrl = resolveCurrentSharePointWebUrl();
      const digest = await getDigest(webUrl);

      await ensureLibrary(webUrl, cfg.siteDb, digest, 'siteDb');
      await refreshSetupStatus();
      await ensureLibrary(webUrl, cfg.usersDb, digest, 'usersDb');
      await refreshSetupStatus();

      await ensureFolder(webUrl, cfg.finalDistRoot, digest, 'dist');
      await ensureFolder(webUrl, `${cfg.siteDbRoot}/siteAssets`, digest, 'siteAssets');
      await ensureFolder(webUrl, `${cfg.siteDbRoot}/images`, digest, 'images');
      await refreshSetupStatus();

      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/bihs_master_config_v1.txt`, JSON.stringify(buildInitialMasterConfig(), null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/users_data.txt`, JSON.stringify([], null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/events_data.txt`, JSON.stringify({ displayCount: 3, displayMode: 'default', events: [] }, null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/nav_data.txt`, JSON.stringify([], null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/site_content_data.txt`, JSON.stringify({}, null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/theme_data.txt`, JSON.stringify({}, null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/external_links_data.txt`, JSON.stringify([], null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.siteDbRoot}/siteAssets/gantt_data.txt`, JSON.stringify(DEFAULT_GANTT_DATA, null, 2), digest);
      await ensureTextFileIfMissing(webUrl, `${cfg.usersDbRoot}/widgets_data.txt`, JSON.stringify({}, null, 2), digest);
      await refreshSetupStatus();

      await copyFromBootstrapToFinal(webUrl, digest);
      await refreshSetupStatus();

      setStatus('done');
      setLatestStep('הקמה הושלמה');
      addLog(`final URL: ${cfg.finalAppUrl}`);
    } catch (error) {
      setStatus('error');
      if (/manifest/i.test(String(error?.message || ''))) {
        setState((p) => ({ ...p, copyFiles: 'failed', finalIndex: 'failed' }));
      }
      setErrorInfo({ title: 'ההקמה נכשלה', step: latestStep, reason: error.message });
      addLog(`setup failure | step=${latestStep} | reason=${error.message}`);
      await refreshSetupStatus().catch(() => {});
    }
  };

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    refreshSetupStatus().catch((error) => addLog(`status refresh failed: ${error.message}`));
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
