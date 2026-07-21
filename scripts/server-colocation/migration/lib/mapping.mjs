import { REQUIRED_MAPPING_FIELDS, canonicalHash } from './core.mjs';

const STATES = new Set(['unresolved', 'reviewed', 'approved-for-validation', 'migrated', 'rejected']);

export function validateMappingManifest(manifest) {
  const errors = [];
  if (!Array.isArray(manifest?.rows)) return ['mapping manifest must contain a rows array.'];
  const identities = new Set();
  const builderIds = new Set();
  manifest.rows.forEach((row, index) => {
    const prefix = `rows[${index}]`;
    for (const field of REQUIRED_MAPPING_FIELDS) {
      if (!(field in row)) errors.push(`${prefix}.${field} is required.`);
    }
    if (row.siteCode && (row.siteCode === row.siteIdentityKey || row.siteCode === row.builderSiteId)) {
      errors.push(`${prefix} infers identity from siteCode; this is forbidden.`);
    }
    if (!STATES.has(row.migrationState)) errors.push(`${prefix}.migrationState is invalid.`);
    if (row.migrationState !== 'unresolved' && !String(row.siteIdentityKey || '').trim()) errors.push(`${prefix}.siteIdentityKey is required for resolved rows.`);
    if (row.siteIdentityKey && identities.has(row.siteIdentityKey)) errors.push(`${prefix}.siteIdentityKey is duplicated.`);
    if (row.builderSiteId && builderIds.has(row.builderSiteId)) errors.push(`${prefix}.builderSiteId is duplicated.`);
    if (row.siteIdentityKey) identities.add(row.siteIdentityKey);
    if (row.builderSiteId) builderIds.add(row.builderSiteId);
  });
  return errors;
}

export function normalizeMappingManifest(manifest) {
  const rows = manifest.rows.map((row) => Object.fromEntries(REQUIRED_MAPPING_FIELDS.map((field) => [field, row[field] ?? null])));
  const normalized = { formatVersion: 1, rows };
  return { ...normalized, canonicalHash: canonicalHash(normalized) };
}
