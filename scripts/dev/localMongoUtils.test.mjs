import { describe, expect, it } from 'vitest';
import {
  assertSafeLocalMongoTarget,
  formatCheckReport,
  isLocalMongoUri,
  parseEnvText,
  requireResetConfirmation,
  summarizeChecks,
} from './localMongoUtils.mjs';

describe('local Mongo dev utilities', () => {
  it('parses env files', () => {
    expect(parseEnvText('MONGODB_DB_NAME=site_builder_test\nADMIN_API_KEY="secret"\n'))
      .toEqual({
        MONGODB_DB_NAME: 'site_builder_test',
        ADMIN_API_KEY: 'secret',
      });
  });

  it('recognizes only local Mongo URIs', () => {
    expect(isLocalMongoUri('mongodb://localhost:27017/site_builder_dev?replicaSet=rs0')).toBe(true);
    expect(isLocalMongoUri('mongodb://127.0.0.1:27017/site_builder_test')).toBe(true);
    expect(isLocalMongoUri('mongodb://mongo.example.com:27017/site_builder_dev')).toBe(false);
  });

  it('refuses production-looking database names for local reset', () => {
    expect(() => assertSafeLocalMongoTarget({
      uri: 'mongodb://localhost:27017/site_builder',
      dbName: 'site_builder',
    })).toThrow('Refusing to reset non-local database');
  });

  it('reset requires an explicit confirmation flag', () => {
    expect(() => requireResetConfirmation([])).toThrow('Refusing reset without --confirm-local-reset');
    expect(() => requireResetConfirmation(['--confirm-local-reset'])).not.toThrow();
  });

  it('formats PASS/WARNING/FAIL check reports', () => {
    const checks = [
      { name: 'Docker', status: 'PASS', message: 'ok' },
      { name: 'Frontend env', status: 'WARNING', message: 'not mongo' },
    ];

    expect(summarizeChecks(checks)).toBe('WARNING');
    expect(formatCheckReport(checks)).toContain('Local Mongo preflight: WARNING');
  });
});
