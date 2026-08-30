import assert from 'node:assert/strict';
import test from 'node:test';
import {
  builderSmokeEnvironmentErrors,
  formatBuilderSmokeEnvironmentError,
} from '../validate-builder-smoke-env.mjs';

test('rejects a HUB MONGO_URI when the Builder MONGODB_URI is missing', () => {
  const errors = builderSmokeEnvironmentErrors({
    MONGO_URI: 'mongodb://secret@127.0.0.1:27018/sitebuilder_hub',
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /MONGO_URI is a HUB variable/u);
});

test('rejects the HUB database from either Builder database setting', () => {
  assert.equal(
    builderSmokeEnvironmentErrors({
      MONGODB_URI: 'mongodb://127.0.0.1:27018/sitebuilder_hub',
      MONGODB_DB_NAME: 'sitebuilder_site_data',
    }).length,
    1,
  );
  assert.equal(
    builderSmokeEnvironmentErrors({
      MONGODB_URI: 'mongodb://127.0.0.1:27018/sitebuilder_site_data',
      MONGODB_DB_NAME: 'sitebuilder_hub',
    }).length,
    1,
  );
});

test('rejects the HUB port and never formats supplied secret values', () => {
  const secret = 'do-not-print-this-secret';
  const errors = builderSmokeEnvironmentErrors({
    MONGODB_URI: `mongodb://${secret}@127.0.0.1:27018/sitebuilder_site_data`,
    MONGODB_DB_NAME: 'sitebuilder_site_data',
    SERVER_PORT: '4100',
  });
  const output = formatBuilderSmokeEnvironmentError(errors);

  assert.equal(errors.length, 1);
  assert.match(output, /wrong HUB \.env was supplied/u);
  assert.doesNotMatch(output, new RegExp(secret, 'u'));
});

test('accepts the intended Builder Data API environment', () => {
  assert.deepEqual(
    builderSmokeEnvironmentErrors({
      NODE_ENV: 'production',
      SERVER_PORT: '3001',
      MONGODB_URI: 'mongodb://127.0.0.1:27018/sitebuilder_site_data',
      MONGODB_DB_NAME: 'sitebuilder_site_data',
      ADMIN_API_KEY: 'synthetic-key',
      CORS_ORIGINS: 'https://builder.example.test',
    }),
    [],
  );
});
