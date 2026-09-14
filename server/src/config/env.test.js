import { describe, expect, it } from 'vitest';
import { assertServerConfig, getServerConfig, validateServerConfig } from './env.js';

describe('server env validation', () => {
  it('fails clearly when Mongo mode is enabled without MONGODB_URI', () => {
    const config = getServerConfig({
      STORAGE_BACKEND: 'mongo',
      MONGODB_URI: '',
      MONGODB_DB_NAME: 'site_builder_dev',
      SERVER_PORT: '3001',
    });

    expect(validateServerConfig(config)).toContain('MONGODB_URI is required when STORAGE_BACKEND=mongo.');
    expect(() => assertServerConfig(config)).toThrow('MONGODB_URI is required when STORAGE_BACKEND=mongo.');
  });

  it('allows non-Mongo storage without MONGODB_URI', () => {
    const config = getServerConfig({
      STORAGE_BACKEND: 'local-dev',
      MONGODB_URI: '',
      MONGODB_DB_NAME: '',
    });

    expect(validateServerConfig(config)).toEqual([]);
  });

  it('uses the approved direct-process port only as a configured fallback', () => {
    const config = getServerConfig({
      STORAGE_BACKEND: 'mongo',
      MONGODB_URI: 'mongodb://127.0.0.1:27018/sitebuilder_site_data',
      MONGODB_DB_NAME: 'sitebuilder_site_data',
      SERVER_PORT: '3001',
      SHUTDOWN_TIMEOUT_MS: '30000',
    });

    expect(config.serverPort).toBe(3001);
    expect(config.mongodbDbName).toBe('sitebuilder_site_data');
    expect(validateServerConfig(config)).toEqual([]);
  });

  it('derives safe public health metadata from env defaults and overrides', () => {
    const config = getServerConfig({
      STORAGE_BACKEND: 'mongo',
      MONGODB_URI: 'mongodb://127.0.0.1:27018/sitebuilder_site_data',
      MONGODB_DB_NAME: 'sitebuilder_site_data',
      APP_VERSION: '0.2.3',
      GIT_COMMIT: 'deadbeef',
      SUPPORTED_FRONTEND_RANGE: '^0.2.0',
    });

    expect(config).toMatchObject({
      appVersion: '0.2.3',
      gitCommit: 'deadbeef',
      dataSchemaVersion: '1.0.0',
      supportedFrontendRange: '^0.2.0',
    });
  });
});
