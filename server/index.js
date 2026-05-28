import { getServerConfig } from './src/config/env.js';
import { createMongoDb } from './src/db/mongo.js';
import { SiteDataRepository } from './src/repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from './src/repository/LegacyCompatibilityRepository.js';
import { createApp } from './src/app.js';

const config = getServerConfig();

async function main() {
  const { client, db } = await createMongoDb(config);
  const repository = new SiteDataRepository(db, {
    collectionPrefix: config.siteCollectionPrefix,
  });
  await repository.initIndexes();

  const legacyRepository = new LegacyCompatibilityRepository(repository);
  const app = createApp({ repository, legacyRepository, config });

  const server = app.listen(config.serverPort, () => {
    console.log(`[site-builder-api] listening on http://localhost:${config.serverPort}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[site-builder-api] failed to start', error);
  process.exit(1);
});
