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
    super(`${normalized.boundary}: ${normalized.operation || normalized.reason || 'Legacy pipeline operation failed'}`, { cause });
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

  onStage('FINAL_ASSET_COPY', 'running');
  for (let index = 0; index < nonIndexEntries.length; index += 1) {
    const entry = nonIndexEntries[index];
    onProgress('FINAL_ASSET_COPY', index + 1, nonIndexEntries.length, entry.path);
    await uploadFile(entry);
  }
  onStage('FINAL_ASSET_COPY', 'passed');

  onStage('FINAL_ASSET_VERIFY', 'running');
  for (let index = 0; index < nonIndexEntries.length; index += 1) {
    const entry = nonIndexEntries[index];
    onProgress('FINAL_ASSET_VERIFY', index + 1, nonIndexEntries.length, entry.path);
    await verifyFile(entry);
  }
  onStage('FINAL_ASSET_VERIFY', 'passed');

  onStage('FINAL_INDEX_COMMIT', 'running');
  await commitIndex(indexEntry);
  onStage('FINAL_INDEX_COMMIT', 'passed');

  onStage('FINAL_INDEX_VERIFY', 'running');
  await verifyIndex(indexEntry);
  onStage('FINAL_INDEX_VERIFY', 'passed');

  onStage('FINAL_APP_SMOKE', 'running');
  const smokeResult = await smoke();
  onStage('FINAL_APP_SMOKE', 'passed');
  onStage('COMPLETE', 'passed');
  return Object.freeze({ buildId, copied: nonIndexEntries.length, smokeResult });
}
