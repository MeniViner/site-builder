export const LEGACY_STAGE_NAMES = Object.freeze([
  'LEGACY_BUILD', 'LIBRARY_CHECK', 'BOOTSTRAP_UPLOAD', 'BOOTSTRAP_VERIFY',
  'BOOTSTRAP_PAGE_LOAD', 'SHAREPOINT_CONTEXTINFO', 'CREATE_LIBRARIES',
  'CREATE_FOLDERS', 'CREATE_TXT_SEEDS', 'FINAL_ASSET_COPY', 'FINAL_ASSET_VERIFY',
  'FINAL_INDEX_COMMIT', 'FINAL_INDEX_VERIFY', 'FINAL_APP_SMOKE', 'COMPLETE',
]);

const FIELDS = Object.freeze([
  ['boundary', 'FAILURE BOUNDARY'], ['operation', 'OPERATION'], ['source', 'SOURCE'],
  ['target', 'TARGET'], ['currentFile', 'CURRENT FILE'], ['method', 'HTTP METHOD'],
  ['status', 'HTTP STATUS'], ['robocopyExitCode', 'ROBOCOPY EXIT CODE'],
  ['expectedSize', 'EXPECTED SIZE'], ['actualSize', 'ACTUAL SIZE'],
  ['expectedSha256', 'EXPECTED SHA256'], ['actualSha256', 'ACTUAL SHA256'],
  ['responsePreview', 'RESPONSE PREVIEW'], ['buildId', 'BUILD ID'], ['nextAction', 'NEXT ACTION'],
]);

const present = (value) => value !== undefined && value !== null && String(value).length > 0;

export function formatLegacyDiagnostic(details = {}) {
  const normalized = {
    ...details,
    boundary: String(details.boundary || 'UNKNOWN').toUpperCase(),
    currentFile: details.currentFile || details.path,
    robocopyExitCode: details.robocopyExitCode ?? details.exitCode,
  };
  return FIELDS.filter(([key]) => present(normalized[key])).map(([key, label]) => `${label}: ${normalized[key]}`).join('\n');
}

export function logLegacyStage(stage, status, details = {}) {
  const suffix = Object.entries(details).filter(([, value]) => present(value)).map(([key, value]) => `${key}=${value}`).join(' | ');
  console.log(`[legacy][${stage}] ${status}${suffix ? ` | ${suffix}` : ''}`);
  console.log(`${stage}: ${status}`);
}

export function logLegacyFailure(details) {
  console.error(formatLegacyDiagnostic(details));
}
