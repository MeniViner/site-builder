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
});
