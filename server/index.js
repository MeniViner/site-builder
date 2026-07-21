import { assertServerConfig, getServerConfig } from './src/config/env.js';
import { assertBuilderDataPlaneReady, createMongoDb, inspectBuilderDataPlane } from './src/db/mongo.js';
import { SiteDataRepository } from './src/repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from './src/repository/LegacyCompatibilityRepository.js';
import { createApp } from './src/app.js';
import { getListenTarget, installGracefulShutdown, safeStartupErrorCode } from './src/runtime/serverRuntime.js';

const config = assertServerConfig(getServerConfig());

async function main() {
  const { client, db } = await createMongoDb(config);
  const repository = new SiteDataRepository(db, {
    collectionPrefix: config.siteCollectionPrefix,
  });
  await assertBuilderDataPlaneReady(db, { requireCollections: config.requireStartupCollections });

  const legacyRepository = new LegacyCompatibilityRepository(repository);
  const app = createApp({
    repository,
    legacyRepository,
    config,
    readinessCheck: () => inspectBuilderDataPlane(db),
  });

  const listenTarget = getListenTarget(config);
  const server = app.listen(listenTarget, () => {
    const mode = typeof listenTarget === 'string' ? 'iisnode pipe' : 'localhost port';
    console.log(`[site-builder-api] listening (${mode})`);
  });

  installGracefulShutdown({ server, closeMongo: () => client.close(), timeoutMs: config.shutdownTimeoutMs });
}

main().catch((error) => {
  console.error(`[site-builder-api] failed to start (${safeStartupErrorCode(error)})`);
  process.exit(1);
});
