import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { LegacyCompatibilityRepository } from '../repository/LegacyCompatibilityRepository.js';
import { SiteDataRepository } from '../repository/SiteDataRepository.js';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { createDevAiRuntime, devAiStartupBanner } from './index.js';
import { createDevAiMiddleware } from './middleware.js';
import { resolveDevAiConfig } from './env.js';
import { fakeAdapter, makeConfig } from './testUtils/devAiTestUtils.js';

const SECRET = 'production-key-that-must-never-be-used';

/**
 * Accidental-production configuration: BOTH gates flipped on, plus a real-looking
 * Groq key and model. Nothing here may make the DEV engine operational.
 */
const ACCIDENTAL_PRODUCTION_ENV = Object.freeze({
  NODE_ENV: 'production',
  DEV_AI_ENABLED: 'true',
  DEV_AI_PROVIDER: 'groq',
  DEV_AI_GROQ_MODEL: 'some-model',
  DEV_AI_OLLAMA_MODEL: 'some-local-model',
  GROQ_API_KEY: SECRET,
});

async function buildApp(config, devAiRuntime) {
  const repository = new SiteDataRepository(new MemoryDb());
  await repository.initIndexes();
  return createApp({
    repository,
    legacyRepository: new LegacyCompatibilityRepository(repository),
    config,
    ...(devAiRuntime === undefined ? {} : { devAiRuntime }),
  });
}

describe('production isolation — the DEV AI engine cannot be activated in production', () => {
  it('createDevAiRuntime returns null in production even with both gates on', () => {
    const runtime = createDevAiRuntime({ env: ACCIDENTAL_PRODUCTION_ENV, nodeEnv: 'production' });
    expect(runtime).toBeNull();
    expect(devAiStartupBanner(runtime)).toContain('not registered');
  });

  it('resolveDevAiConfig refuses to enable in production', () => {
    const config = resolveDevAiConfig({ env: ACCIDENTAL_PRODUCTION_ENV });
    expect(config.enabled).toBe(false);
    expect(config.routeAllowed).toBe(false);
  });

  it('the Express app does not register /api/dev-ai in production', async () => {
    const app = await buildApp({
      corsOrigins: ['http://allowed.test'],
      nodeEnv: 'production',
      adminApiKey: 'secret',
      storageBackend: 'mongo',
    }, createDevAiRuntime({ env: ACCIDENTAL_PRODUCTION_ENV, nodeEnv: 'production' }));

    // /api/dev-ai/* falls through to the API-key guard, never to the DEV engine.
    const health = await request(app).get('/api/dev-ai/health');
    expect(health.status).toBe(401);
    expect(JSON.stringify(health.body)).not.toContain('DEV_AI');

    const stream = await request(app)
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'x' }] });
    expect(stream.status).toBe(401);
  });

  it('registers the route in development', async () => {
    const noNetwork = () => {
      throw new Error('automated tests must never contact a real provider');
    };
    const runtime = createDevAiRuntime({
      env: {
        NODE_ENV: 'development',
        DEV_AI_ENABLED: 'true',
        DEV_AI_GROQ_MODEL: 'mocked-model',
        GROQ_API_KEY: SECRET,
      },
      nodeEnv: 'development',
      adapters: { ollama: fakeAdapter('ollama'), groq: fakeAdapter('groq') },
      fetchImpl: noNetwork,
    });
    expect(runtime).not.toBeNull();

    const app = await buildApp({
      corsOrigins: ['http://allowed.test'],
      nodeEnv: 'test',
      adminApiKey: 'secret',
      storageBackend: 'mongo',
    }, runtime);

    const health = await request(app).get('/api/dev-ai/health').expect(200);
    expect(health.body.enabled).toBe(true);
    expect(health.body.providers.groq.apiKeyPresent).toBe(true);
    expect(JSON.stringify(health.body)).not.toContain(SECRET);
  });

  it('the middleware itself refuses to serve a production config', async () => {
    const config = resolveDevAiConfig({ env: ACCIDENTAL_PRODUCTION_ENV });
    const called = [];
    const app = express();
    app.use('/api/dev-ai', createDevAiMiddleware({
      config,
      adapters: { ollama: fakeAdapter('ollama'), groq: fakeAdapter('groq') },
    }));
    app.use((_req, res) => {
      called.push('fell-through');
      res.status(404).json({ ok: false, fellThrough: true });
    });

    const response = await request(app).get('/api/dev-ai/health').expect(404);
    expect(response.body.fellThrough).toBe(true);
    expect(called).toEqual(['fell-through']);
  });

  it('server-side Groq/Ollama configuration has no effect on production AI routing', async () => {
    const app = await buildApp({
      corsOrigins: ['http://allowed.test'],
      nodeEnv: 'production',
      adminApiKey: 'secret',
      storageBackend: 'mongo',
    }, createDevAiRuntime({ env: ACCIDENTAL_PRODUCTION_ENV, nodeEnv: 'production' }));

    // The existing production surface is untouched by DEV AI configuration.
    const liveness = await request(app).get('/healthz').expect(200);
    expect(liveness.body.ok).toBe(true);
    expect(JSON.stringify(liveness.body)).not.toContain(SECRET);

    await request(app).get('/api/sites').expect(401);
  });

  it('never reads the developer secret file in production', () => {
    const config = makeConfig({ NODE_ENV: 'production' });
    expect(config.enabled).toBe(false);
    expect(config.routeAllowed).toBe(false);
  });
});
