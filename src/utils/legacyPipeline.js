export const LEGACY_PIPELINE_STAGES = Object.freeze([
  'LEGACY_BUILD',
  'LIBRARY_CHECK',
  'BOOTSTRAP_UPLOAD',
  'BOOTSTRAP_INDEX_COMMIT',
  'BOOTSTRAP_VERIFY',
  'BOOTSTRAP_PAGE_LOAD',
  'SHAREPOINT_CONTEXTINFO',
  'CREATE_LIBRARIES',
  'CREATE_FOLDERS',
  'CREATE_TXT_SEEDS',
  'FINAL_ASSET_COPY',
  'FINAL_ASSET_VERIFY',
  'FINAL_INDEX_COMMIT',
  'FINAL_INDEX_VERIFY',
  'FINAL_APP_SMOKE',
  'COMPLETE',
]);

export const NEW_SITE_STAGE_ORDER = LEGACY_PIPELINE_STAGES;
export const BROWSER_STAGE_TIMEOUT_MS = 5 * 60 * 1000;
export const BROWSER_STAGE_TIMEOUTS = Object.freeze({
  FINAL_ASSET_COPY: 30 * 60 * 1000,
  FINAL_ASSET_VERIFY: 30 * 60 * 1000,
});
export const EXISTING_SITE_STAGE_ORDER = Object.freeze([
  'LEGACY_BUILD',
  'LIBRARY_CHECK',
  'CREATE_FOLDERS',
  'FINAL_ASSET_COPY',
  'FINAL_ASSET_VERIFY',
  'FINAL_INDEX_COMMIT',
  'FINAL_INDEX_VERIFY',
  'FINAL_APP_SMOKE',
  'COMPLETE',
]);

const FAILURE_FIELDS = Object.freeze([
  ['boundary', 'FAILURE BOUNDARY'],
  ['operation', 'OPERATION'],
  ['source', 'SOURCE'],
  ['target', 'TARGET'],
  ['currentFile', 'CURRENT FILE'],
  ['method', 'HTTP METHOD'],
  ['status', 'HTTP STATUS'],
  ['error', 'ERROR'],
  ['property', 'PROPERTY'],
  ['elapsedTime', 'ELAPSED TIME'],
  ['robocopyExitCode', 'ROBOCOPY EXIT CODE'],
  ['expectedSize', 'EXPECTED SIZE'],
  ['actualSize', 'ACTUAL SIZE'],
  ['expectedSha256', 'EXPECTED SHA256'],
  ['actualSha256', 'ACTUAL SHA256'],
  ['responsePreview', 'RESPONSE PREVIEW'],
  ['buildId', 'BUILD ID'],
  ['nextAction', 'NEXT ACTION'],
]);

const present = (value) => value !== undefined && value !== null && String(value).length > 0;

export class LegacyPipelineError extends Error {
  constructor(details, cause) {
    const normalized = normalizeLegacyFailure(details);
    const summary = [normalized.operation, normalized.reason].filter(Boolean).join(' — ') || 'Legacy pipeline operation failed';
    super(`${normalized.boundary}: ${summary}`, { cause });
    this.name = 'LegacyPipelineError';
    this.legacyFailure = normalized;
  }
}

export function normalizeLegacyFailure(details = {}) {
  const boundary = String(details.boundary || details.phase || 'UNKNOWN').trim().toUpperCase();
  return Object.freeze({
    boundary,
    operation: details.operation || details.phase || '',
    source: details.source || '',
    target: details.target || '',
    currentFile: details.currentFile || details.path || '',
    method: details.method || '',
    status: details.status,
    error: details.error || details.code || '',
    property: details.property || '',
    elapsedTime: details.elapsedTime || '',
    robocopyExitCode: details.robocopyExitCode ?? details.exitCode,
    expectedSize: details.expectedSize,
    actualSize: details.actualSize,
    expectedSha256: details.expectedSha256 || '',
    actualSha256: details.actualSha256 || '',
    responsePreview: details.responsePreview || '',
    buildId: details.buildId || '',
    nextAction: details.nextAction || '',
    reason: details.reason || '',
  });
}

export function legacyPipelineFailure(details, cause) {
  if (cause instanceof LegacyPipelineError && !details) return cause;
  return new LegacyPipelineError(details, cause);
}

export function formatLegacyFailure(details) {
  const failure = normalizeLegacyFailure(details);
  return FAILURE_FIELDS
    .filter(([key]) => present(failure[key]))
    .map(([key, label]) => `${label}: ${failure[key]}`)
    .join('\n');
}

export function createLegacyStageState(initial = {}) {
  return Object.freeze(Object.fromEntries(LEGACY_PIPELINE_STAGES.map((stage) => [stage, initial[stage] || 'waiting'])));
}

export async function executeBrowserStage({
  stage,
  operation,
  work,
  context = {},
  timeoutMs = BROWSER_STAGE_TIMEOUTS[stage] || BROWSER_STAGE_TIMEOUT_MS,
  onStatus = () => {},
  now = () => Date.now(),
} = {}) {
  const startedAt = now();
  onStatus(stage, 'running', context);
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const elapsedMs = Math.max(0, now() - startedAt);
      reject(legacyPipelineFailure({
        boundary: stage,
        operation,
        ...context,
        error: 'STAGE_TIMEOUT',
        reason: 'STAGE_TIMEOUT',
        elapsedTime: `${elapsedMs}ms`,
        nextAction: `Retry ${stage}; completed stages are safe to recheck.`,
      }));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve().then(work), timeout]);
    onStatus(stage, 'passed', context);
    return result;
  } catch (error) {
    onStatus(stage, 'failed', context);
    if (error instanceof LegacyPipelineError) throw error;
    throw legacyPipelineFailure({
      boundary: stage,
      operation: error?.operation || operation,
      ...context,
      error: error?.code || '',
      property: error?.property || '',
      reason: error?.message || String(error),
      elapsedTime: `${Math.max(0, now() - startedAt)}ms`,
      nextAction: `Correct or retry ${stage}; completed stages are safe to recheck.`,
    }, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

const normalizeServerRelative = (value) => `/${String(value || '').split('/').filter(Boolean).join('/')}`;

export function deriveRequiredFolders(rootRel, entries) {
  const root = normalizeServerRelative(rootRel);
  const folders = new Set([root]);
  for (const entry of entries || []) {
    const parts = String(entry?.path || '').split('/').filter(Boolean);
    parts.pop();
    let current = root;
    for (const part of parts) {
      current = `${current}/${part}`;
      folders.add(current);
    }
  }
  return [...folders].sort((left, right) => left.split('/').length - right.split('/').length || left.localeCompare(right));
}

export function classifyTxtSeed({ status, text = '' }) {
  if (status >= 200 && status < 300 && String(text).trim().length > 0) return 'preserve';
  if (status === 404 || (status >= 200 && status < 300)) return 'create';
  return 'fail';
}

export async function runFinalAssetStages({
  manifest,
  deploymentEntries,
  ensureFolder,
  uploadFile,
  verifyFile,
  commitIndex,
  verifyIndex,
  smoke,
  skipFolderStage = false,
  onStage = () => {},
  onProgress = () => {},
  stageRunner,
}) {
  const buildId = manifest.buildId;
  const nonIndexEntries = deploymentEntries.filter((entry) => entry.path !== 'index.html');
  const indexEntry = deploymentEntries.find((entry) => entry.path === 'index.html');
  if (!indexEntry) throw legacyPipelineFailure({ boundary: 'FINAL_INDEX_COMMIT', operation: 'resolve-index-entry', buildId, nextAction: 'Rebuild the Legacy artifact.' });

  if (!skipFolderStage) {
    onStage('CREATE_FOLDERS', 'running');
    for (const folder of deriveRequiredFolders(manifest.targetRoot || '', deploymentEntries)) await ensureFolder(folder);
    onStage('CREATE_FOLDERS', 'passed');
  }

  const run = stageRunner || ((stage, operation, work, context) => executeBrowserStage({
    stage,
    operation,
    work,
    context,
    onStatus: onStage,
  }));

  await run('FINAL_ASSET_COPY', 'copy-final-assets', async () => {
    for (let index = 0; index < nonIndexEntries.length; index += 1) {
      const entry = nonIndexEntries[index];
      onProgress('FINAL_ASSET_COPY', index + 1, nonIndexEntries.length, entry.path);
      await uploadFile(entry);
    }
  }, { buildId });

  await run('FINAL_ASSET_VERIFY', 'verify-final-assets', async () => {
    for (let index = 0; index < nonIndexEntries.length; index += 1) {
      const entry = nonIndexEntries[index];
      onProgress('FINAL_ASSET_VERIFY', index + 1, nonIndexEntries.length, entry.path);
      await verifyFile(entry);
    }
  }, { buildId });

  await run('FINAL_INDEX_COMMIT', 'commit-final-index', () => commitIndex(indexEntry), { buildId });
  await run('FINAL_INDEX_VERIFY', 'verify-final-index', () => verifyIndex(indexEntry), { buildId });
  const smokeResult = await run('FINAL_APP_SMOKE', 'smoke-final-app', smoke, { buildId });
  return Object.freeze({ buildId, copied: nonIndexEntries.length, smokeResult });
}
