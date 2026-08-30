const assert = require('node:assert/strict');
const { test } = require('node:test');
const config = require('../config');
const authGuard = require('../middlewares/authGuard');

test('fails closed when auth is enabled without a configured token', () => {
  const previousDisabled = config.security.disableAuthGuard;
  const previousToken = config.security.apiSecretToken;
  config.security.disableAuthGuard = false;
  config.security.apiSecretToken = '';
  let status;
  let payload;
  try {
    authGuard(
      { headers: {} },
      {
        status(value) {
          status = value;
          return this;
        },
        json(value) {
          payload = value;
        },
      },
      () => assert.fail('auth guard must not call next'),
    );
  } finally {
    config.security.disableAuthGuard = previousDisabled;
    config.security.apiSecretToken = previousToken;
  }
  assert.equal(status, 503);
  assert.equal(payload.error.code, 'AUTH_NOT_CONFIGURED');
});
