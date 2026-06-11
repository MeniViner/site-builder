import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { checkMongoEnvDatabase } from './check-native-local-mongo.mjs';

describe('native Mongo check helpers', () => {
  it('rejects non-local Mongo URI without contacting MongoDB', async () => {
    const result = await checkMongoEnvDatabase('Mongo dev', 'mongodb://mongo.example.com:27017/site_builder_dev', 'site_builder_dev');
    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('Refusing non-local MongoDB URI');
  });

  it('rejects unexpected local database names', async () => {
    const result = await checkMongoEnvDatabase('Mongo dev', 'mongodb://127.0.0.1:27017/site_builder_dev', 'production_db');
    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('Refusing to use unexpected database name');
  });

  it('does not reference docker commands for native check', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/dev/check-native-local-mongo.mjs'), 'utf8');
    expect(/\bdocker\b/.test(source)).toBe(false);
  });

  it('does not require replica set initialization for native standalone MongoDB', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/dev/check-native-local-mongo.mjs'), 'utf8');
    expect(source).not.toContain('Initialize replica set first');
    expect(source).toContain('Mongo reachable as standalone server');
  });
});
