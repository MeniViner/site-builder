#!/usr/bin/env node
/**
 * Release assembler for the Windows Server transition package.
 * Windows runtime/tool inputs are deliberately local files. JavaScript runtime
 * dependencies are installed into clean staging directories with the committed
 * production lockfile; the script never copies source-repository node_modules
 * or invokes a TypeScript build.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const RUNTIME_DEPENDENCIES_SOURCE = path.join(
  SOURCE_ROOT,
  'scripts/server-colocation/release/runtime-dependencies',
);
const WINDOWS_TOOLS = ['bsondump.exe', 'mongodump.exe', 'mongoexport.exe', 'mongofiles.exe', 'mongoimport.exe', 'mongorestore.exe', 'mongostat.exe', 'mongotop.exe'];
const MAC_MAGIC = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca']);

function argsOf(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = execFile(command, args, { ...options, windowsHide: true }, (error, stdout, stderr) => {
    if (error) reject(new Error(`${command} failed: ${stderr || error.message}`));
    else resolve({ stdout, stderr });
  });
  child.on('error', reject);
});

async function exists(target) { try { await fs.access(target); return true; } catch { return false; } }
async function sha256(file) { const input = await fs.readFile(file); return createHash('sha256').update(input).digest('hex'); }
async function mkdir(target) { await fs.mkdir(target, { recursive: true }); }
async function copy(source, target) { await mkdir(path.dirname(target)); await fs.copyFile(source, target); }
async function readJson(target) { return JSON.parse(await fs.readFile(target, 'utf8')); }

function isForbiddenPath(relativePath) {
  const segments = relativePath.split(path.sep);
  const base = path.basename(relativePath).toLowerCase();
  return base === '.ds_store' || base.startsWith('.env') || base === 'tsconfig.json' || (base.endsWith('.ts') && !base.endsWith('.d.ts')) || base.endsWith('.node') || base.endsWith('.dylib') || base.endsWith('.so') || base.endsWith('.a') || base.endsWith('.o') || segments.includes('.git') || segments.includes('test') || segments.includes('tests');
}

async function copyTree(source, destination, filter = () => true) {
  await fs.cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (entry) => filter(entry, path.relative(source, entry)),
  });
}

async function pruneForbiddenTree(root, current = root) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute);
    if (isForbiddenPath(relative)) {
      await fs.rm(absolute, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await pruneForbiddenTree(root, absolute);
    }
  }
}

function satisfiesCaret(version, range) {
  const versionParts = String(version).split('.').map(Number);
  const match = String(range).match(/^\^(\d+)\.(\d+)\.(\d+)$/u);
  if (!match || versionParts.length !== 3 || versionParts.some((part) => !Number.isInteger(part))) return false;
  const minimum = match.slice(1).map(Number);
  if (versionParts[0] !== minimum[0]) return false;
  for (let index = 0; index < 3; index += 1) {
    if (versionParts[index] > minimum[index]) return true;
    if (versionParts[index] < minimum[index]) return false;
  }
  return true;
}

async function installProductionDependencies(destination) {
  await mkdir(destination);
  await copy(
    path.join(RUNTIME_DEPENDENCIES_SOURCE, 'package.json'),
    path.join(destination, 'package.json'),
  );
  await copy(
    path.join(RUNTIME_DEPENDENCIES_SOURCE, 'package-lock.json'),
    path.join(destination, 'package-lock.json'),
  );
  await run(
    'npm',
    ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      cwd: destination,
      env: { ...process.env, npm_config_update_notifier: 'false' },
    },
  );

  const lock = await readJson(path.join(destination, 'package-lock.json'));
  const mongodbPackage = await readJson(path.join(destination, 'node_modules/mongodb/package.json'));
  const bsonPackage = await readJson(path.join(destination, 'node_modules/bson/package.json'));
  const lockedMongo = lock.packages?.['node_modules/mongodb'];
  const lockedBson = lock.packages?.['node_modules/bson'];
  const bsonRequirement = mongodbPackage.dependencies?.bson;

  if (
    !lockedMongo
    || !lockedBson
    || mongodbPackage.version !== lockedMongo.version
    || bsonPackage.version !== lockedBson.version
    || !satisfiesCaret(bsonPackage.version, bsonRequirement)
  ) {
    throw new Error('Staged mongodb and bson do not match the committed compatible lockfile pair.');
  }

  await run(
    process.execPath,
    ['-e', "const mongodb=require('mongodb');const bson=require('bson');if(!mongodb.MongoClient||typeof bson.ByteUtils?.encodeUTF8Into!=='function')process.exit(2)"],
    { cwd: destination, env: { ...process.env, NODE_PATH: '' } },
  );

  const packages = Object.entries(lock.packages || {})
    .filter(([relative]) => relative.startsWith('node_modules/'))
    .map(([relative, metadata]) => ({
      path: relative,
      version: metadata.version,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  await fs.rm(path.join(destination, 'package-lock.json'));
  await pruneForbiddenTree(path.join(destination, 'node_modules'));
  return {
    packages,
    lockfileVersion: lock.lockfileVersion,
    mongodbVersion: mongodbPackage.version,
    bsonVersion: bsonPackage.version,
    bsonRequirement,
  };
}

async function listFiles(root) {
  const result = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  }
  await walk(root);
  return result;
}

async function writeInternalManifest(root) {
  const files = await listFiles(root);
  const rows = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel === 'MANIFEST-SHA256.txt') continue;
    rows.push(`${await sha256(file)}  ${rel}`);
  }
  await fs.writeFile(path.join(root, 'MANIFEST-SHA256.txt'), `${rows.join('\n')}\n`);
}

async function createZip(parent, directoryName, output) {
  await fs.rm(output, { force: true });
  await run('/usr/bin/zip', ['-X', '-q', '-r', output, directoryName], { cwd: parent, env: { ...process.env, COPYFILE_DISABLE: '1' } });
}

async function assertWindowsOnly(root) {
  for (const file of await listFiles(root)) {
    const rel = path.relative(root, file);
    if (isForbiddenPath(rel)) throw new Error(`Forbidden non-Windows or secret-like package path: ${rel}`);
    const header = (await fs.readFile(file)).subarray(0, 4).toString('hex');
    if (MAC_MAGIC.has(header)) throw new Error(`Mach-O content is not permitted in Windows package: ${rel}`);
  }
}

function commonReadme() {
  return `# Site Builder Server transition kit\n\nThis is an offline Windows Server package. It includes all Node JavaScript dependencies and the Windows Node runtime; do **not** run \`npm install\` or a TypeScript build on the server.\n\nCopy the package intact to a local disk path, configure secrets only in the server-owned environment or secret manager, then follow the supplied cutover and rollback documents. The package contains no production database export, credentials, or \`.env\` file.\n`;
}

function cutoverOrder() {
  return `# Cutover order\n\n1. Stop at the approved change window; retain the source export and source/target inventory evidence.\n2. Verify each ZIP against the external SHA-256 values, then verify its internal \`MANIFEST-SHA256.txt\`.\n3. Extract the Mongo tools package and run only its reviewed preflight/export/import/verify procedure with server-held credentials.\n4. Extract the Builder API package, configure its server-owned environment, and run \`INSTALL-IIS-DRY-RUN.cmd\`.\n5. After approved IIS prerequisites are present, run \`INSTALL-IIS.cmd\`; it creates a separate loopback-only site and pool.\n6. Run \`VERIFY-HEALTH.cmd\` and the authenticated application smoke checks.\n7. Obtain explicit release-owner approval before any gateway or runtime switch. This kit does not perform that switch.\n`;
}

function rollbackOrder() {
  return `# Rollback order\n\n1. Stop the transition and preserve logs, inventories, archive checksums, and validation results.\n2. Do not delete the restored target database or the BSON archive.\n3. If IIS was installed, run \`ROLLBACK-IIS.cmd\`; it removes only the dedicated Builder site and unused pool.\n4. Restore the previously approved runtime routing outside this kit, then verify the original service.\n5. Record the reason for rollback and retain all evidence for review.\n`;
}

function securityChecklist() {
  return `# Security checklist\n\n- [ ] ZIP and internal manifests verified before extraction.\n- [ ] No credentials are stored in package files, command history, or IIS configuration.\n- [ ] MongoDB URI, API key, and allowed CORS origins are provided by the server secret boundary.\n- [ ] API binding is loopback-only and uses a dedicated IIS application pool.\n- [ ] The HUB site and pool are not edited.\n- [ ] The Mongo transfer uses the reviewed namespace mapping and a target database distinct from the HUB database.\n- [ ] Authentication, health, write/conflict, and restart-persistence smoke checks are recorded.\n- [ ] No gateway, runtime switch, or production mutation is performed without separate approval.\n`;
}

async function extractMongoTools(msi, destination) {
  const scratch = path.join(path.dirname(destination), '.mongo-msi-extract');
  await fs.rm(scratch, { recursive: true, force: true });
  await mkdir(scratch);
  await run('7zz', ['x', '-y', `-o${scratch}`, msi]);
  await mkdir(destination);
  for (const name of WINDOWS_TOOLS) await copy(path.join(scratch, name), path.join(destination, name));
  await fs.rm(scratch, { recursive: true, force: true });
}

async function copyReleaseDocs(destination) {
  await fs.writeFile(path.join(destination, 'README-FIRST.md'), commonReadme());
  await fs.writeFile(path.join(destination, 'CUTOVER-ORDER.md'), cutoverOrder());
  await fs.writeFile(path.join(destination, 'ROLLBACK-ORDER.md'), rollbackOrder());
  await fs.writeFile(path.join(destination, 'SECURITY-CHECKLIST.md'), securityChecklist());
}

async function buildDataApi({ staging, nodeZip }) {
  const root = path.join(staging, 'sitebuilder-data-api-windows');
  await mkdir(root);
  await copyReleaseDocs(root);
  await fs.writeFile(path.join(root, 'CONFIGURATION.env.example'), `NODE_ENV=production\nSERVER_PORT=3001\nSTORAGE_BACKEND=mongo\nMONGODB_URI=mongodb://127.0.0.1:27018/sitebuilder_site_data\nMONGODB_DB_NAME=sitebuilder_site_data\nADMIN_API_KEY=<required-builder-admin-api-key>\nCORS_ORIGINS=https://replace-with-approved-builder-origin\nSITE_COLLECTION_PREFIX=site_\nREQUIRE_STARTUP_COLLECTIONS=true\n`);
  const nodeScratch = path.join(staging, '.node-extract');
  await fs.rm(nodeScratch, { recursive: true, force: true });
  await mkdir(nodeScratch);
  await run('/usr/bin/unzip', ['-q', nodeZip, '-d', nodeScratch]);
  const nodeRoot = (await fs.readdir(nodeScratch, { withFileTypes: true })).find((entry) => entry.isDirectory())?.name;
  if (!nodeRoot) throw new Error('Windows Node ZIP did not contain a root directory.');
  await copy(path.join(nodeScratch, nodeRoot, 'node.exe'), path.join(root, 'runtime', 'node.exe'));
  await fs.rm(nodeScratch, { recursive: true, force: true });
  await copyTree(path.join(SOURCE_ROOT, 'server'), path.join(root, 'app', 'server'), (_entry, rel) => !isForbiddenPath(rel));
  await copy(
    path.join(SOURCE_ROOT, 'scripts/server-colocation/release/validate-builder-smoke-env.mjs'),
    path.join(root, 'app', 'validate-builder-smoke-env.mjs'),
  );
  const dependencyInfo = await installProductionDependencies(path.join(root, 'app'));
  await copyTree(path.join(SOURCE_ROOT, 'scripts/server-colocation/iis'), path.join(root, 'iis'), (_entry, rel) => !isForbiddenPath(rel));
  const webTemplate = await fs.readFile(path.join(root, 'iis', 'web.config.template'), 'utf8');
  await fs.writeFile(path.join(root, 'web.config'), webTemplate.replaceAll('__NODE_ENTRY__', 'app/server/index.js'));
  await fs.writeFile(path.join(root, 'START-LOCAL-SMOKE.cmd'), '@echo off\r\nsetlocal EnableExtensions\r\nrem Safety check rejects HUB MONGO_URI, sitebuilder_hub, and SERVER_PORT 4100 without printing values.\r\npushd "%~dp0" >nul\r\n"%~dp0runtime\\node.exe" "%~dp0app\\validate-builder-smoke-env.mjs"\r\nif errorlevel 1 (\r\n  popd\r\n  exit /b 2\r\n)\r\n"%~dp0runtime\\node.exe" "%~dp0app\\server\\index.js"\r\nset "BUILDER_EXIT=%ERRORLEVEL%"\r\npopd\r\nexit /b %BUILDER_EXIT%\r\n');
  await fs.writeFile(path.join(root, 'PACKAGE-CONTENTS.json'), `${JSON.stringify({
    component: 'sitebuilder-data-api',
    nodeRuntime: path.basename(nodeZip),
    productionPackages: dependencyInfo.packages,
    dependencyLock: {
      source: 'scripts/server-colocation/release/runtime-dependencies/package-lock.json',
      lockfileVersion: dependencyInfo.lockfileVersion,
      mongodbVersion: dependencyInfo.mongodbVersion,
      bsonVersion: dependencyInfo.bsonVersion,
      bsonRequirement: dependencyInfo.bsonRequirement,
    },
  }, null, 2)}\n`);
  await writeInternalManifest(root);
  await assertWindowsOnly(root);
  return root;
}

async function buildMongoTools({ staging, msi, nodeZip }) {
  const root = path.join(staging, 'sitebuilder-mongo-transfer-tools-windows');
  await mkdir(root);
  await copyReleaseDocs(root);
  await copy(msi, path.join(root, 'installer', path.basename(msi)));
  await extractMongoTools(msi, path.join(root, 'bin'));
  const nodeScratch = path.join(staging, '.mongo-node-extract');
  await fs.rm(nodeScratch, { recursive: true, force: true }); await mkdir(nodeScratch);
  await run('/usr/bin/unzip', ['-q', nodeZip, '-d', nodeScratch]);
  const nodeRoot = (await fs.readdir(nodeScratch, { withFileTypes: true })).find((entry) => entry.isDirectory())?.name;
  await copy(path.join(nodeScratch, nodeRoot, 'node.exe'), path.join(root, 'runtime', 'node.exe'));
  await fs.rm(nodeScratch, { recursive: true, force: true });
  await copyTree(path.join(SOURCE_ROOT, 'scripts/server-colocation/migration'), path.join(root, 'migration'), (_entry, rel) => !isForbiddenPath(rel));
  const dependencyInfo = await installProductionDependencies(root);
  await fs.writeFile(path.join(root, 'RUN-INVENTORY.cmd'), '@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0migration\\inventory.mjs" %*\r\n');
  await fs.writeFile(path.join(root, 'RUN-VERIFY.cmd'), '@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0migration\\verify.mjs" %*\r\n');
  await fs.writeFile(path.join(root, 'PACKAGE-CONTENTS.json'), `${JSON.stringify({
    component: 'sitebuilder-mongo-transfer-tools',
    mongoTools: WINDOWS_TOOLS,
    nodeRuntime: path.basename(nodeZip),
    productionPackages: dependencyInfo.packages,
    dependencyLock: {
      source: 'scripts/server-colocation/release/runtime-dependencies/package-lock.json',
      lockfileVersion: dependencyInfo.lockfileVersion,
      mongodbVersion: dependencyInfo.mongodbVersion,
      bsonVersion: dependencyInfo.bsonVersion,
      bsonRequirement: dependencyInfo.bsonRequirement,
    },
    msiSha256: await sha256(msi),
  }, null, 2)}\n`);
  await writeInternalManifest(root);
  await assertWindowsOnly(root);
  return root;
}

async function main() {
  const args = argsOf(process.argv);
  const output = path.resolve(args.output || '');
  const msi = path.resolve(args['mongo-msi'] || '');
  const nodeZip = path.resolve(args['node-win-zip'] || '');
  if (!output || !args.output || !args['mongo-msi'] || !args['node-win-zip']) throw new Error('Usage: --output <empty-dir> --mongo-msi <file> --node-win-zip <file>');
  if (await exists(output)) throw new Error(`Output must be a new directory: ${output}`);
  if (!await exists(msi) || !await exists(nodeZip)) throw new Error('Local Mongo MSI and Windows Node ZIP inputs are required.');
  await mkdir(output);
  const staging = path.join(output, 'staging'); await mkdir(staging);
  const dataRoot = await buildDataApi({ staging, nodeZip });
  const mongoRoot = await buildMongoTools({ staging, msi, nodeZip });
  const artifacts = path.join(output, 'artifacts'); await mkdir(artifacts);
  const dataZip = path.join(artifacts, 'sitebuilder-data-api-windows.zip');
  const mongoZip = path.join(artifacts, 'sitebuilder-mongo-transfer-tools-windows.zip');
  await createZip(staging, path.basename(dataRoot), dataZip);
  await createZip(staging, path.basename(mongoRoot), mongoZip);
  const complete = path.join(staging, 'sitebuilder-server-colocation-complete-kit'); await mkdir(complete);
  await copyReleaseDocs(complete);
  await copy(dataZip, path.join(complete, path.basename(dataZip)));
  await copy(mongoZip, path.join(complete, path.basename(mongoZip)));
  await fs.writeFile(path.join(complete, 'EXTERNAL-SHA256.txt'), `${await sha256(dataZip)}  ${path.basename(dataZip)}\n${await sha256(mongoZip)}  ${path.basename(mongoZip)}\n`);
  await writeInternalManifest(complete); await assertWindowsOnly(complete);
  const completeZip = path.join(artifacts, 'sitebuilder-server-colocation-complete-kit.zip');
  await createZip(staging, path.basename(complete), completeZip);
  const external = [dataZip, mongoZip, completeZip];
  await fs.writeFile(path.join(artifacts, 'SHA256SUMS.txt'), `${(await Promise.all(external.map(async (file) => `${await sha256(file)}  ${path.basename(file)}`))).join('\n')}\n`);
  await fs.rm(staging, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ ok: true, artifacts, checksums: path.join(artifacts, 'SHA256SUMS.txt') })}\n`);
}

main().catch((error) => { process.stderr.write(`Release assembly failed: ${error.message}\n`); process.exitCode = 1; });
