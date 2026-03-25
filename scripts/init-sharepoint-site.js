// scripts/init-sharepoint-site.js
import fs from 'fs';
import path from 'path';
import { parseCliArgs, resolveConfig, writeEnvProduction } from './sp-env.js';

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });
const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';

const shouldWriteEnv = cli['write-env'] === true || String(cli['write-env'] || '').toLowerCase() === 'true';
if (shouldWriteEnv) {
  const outputPath = writeEnvProduction(config, envPath);
  console.log(`[init-site] Updated environment file: ${outputPath}`);
}

const foldersToCreate = [
  config.siteRootRel,
  config.siteDbRel,
  config.distRel,
  config.siteAssetsRel,
  config.imagesRel,
  config.usersDbRel,
];

const defaultFiles = [
  {
    key: 'masterConfig',
    content: JSON.stringify({ schemaVersion: '1.0.0' }, null, 2),
  },
  {
    key: 'users',
    content: JSON.stringify([
      {
        id: 1,
        name: 'מנהל לדוגמה',
        role: 'admin',
        personalNumber: '8856096',
        email: '',
        loginName: '',
      },
    ], null, 2),
  },
  {
    key: 'events',
    content: JSON.stringify({ displayCount: 3, displayMode: 'default', events: [] }, null, 2),
  },
  {
    key: 'navigation',
    content: JSON.stringify([], null, 2),
  },
  {
    key: 'siteContent',
    content: JSON.stringify({}, null, 2),
  },
  {
    key: 'theme',
    content: JSON.stringify({}, null, 2),
  },
  {
    key: 'widgets',
    content: JSON.stringify({}, null, 2),
  },
  {
    key: 'externalLinks',
    content: JSON.stringify([], null, 2),
  },
];

const ensureDir = (serverRelativeDir) => {
  const fullPath = config.toWebDav(serverRelativeDir);
  if (dryRun) {
    return fullPath;
  }
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
};

const ensureTextFile = (serverRelativeFilePath, content) => {
  const fullPath = config.toWebDav(serverRelativeFilePath);
  if (dryRun) {
    return { created: null, fullPath };
  }

  const parent = path.win32.dirname(fullPath);
  fs.mkdirSync(parent, { recursive: true });

  if (fs.existsSync(fullPath)) {
    const existing = fs.readFileSync(fullPath, 'utf8');
    if (existing.trim().length > 0) {
      return { created: false, fullPath };
    }
  }

  fs.writeFileSync(fullPath, `${content}\n`, 'utf8');
  return { created: true, fullPath };
};

console.log(`[init-site] Site: ${config.siteCode}`);
console.log(`[init-site] WebDav root: ${config.webDavRoot}`);
if (dryRun) {
  console.log('[init-site] Dry-run mode: no files/folders will be created.');
}

try {
  for (const folder of foldersToCreate) {
    const fullPath = ensureDir(folder);
    console.log(`[init-site] ensured folder: ${fullPath}`);
  }

  for (const fileDef of defaultFiles) {
    const target = config.fileMap[fileDef.key];
    if (!target) continue;
    const result = ensureTextFile(target, fileDef.content);
    if (result.created === null) {
      console.log(`[init-site] would ensure file: ${result.fullPath}`);
    } else if (result.created) {
      console.log(`[init-site] created file: ${result.fullPath}`);
    } else {
      console.log(`[init-site] kept existing file: ${result.fullPath}`);
    }
  }

  console.log('[init-site] SharePoint site structure is ready.');
  console.log(`[init-site] siteDB: ${config.siteDbRel}`);
  console.log(`[init-site] siteUsersDb: ${config.usersDbRel}`);
  console.log(`[init-site] widgets_data location: ${config.fileMap.widgets}`);
} catch (error) {
  console.error(`[init-site] Error: ${error.message}`);
  process.exit(1);
}
