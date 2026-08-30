#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith('--') || !argv[index + 1]) {
      throw new Error(`Expected --name value, got ${key || ''}`);
    }
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  execFile(command, args, options, (error, stdout, stderr) => {
    if (error) reject(new Error(`${command} failed: ${stderr || error.message}`));
    else resolve({ stdout, stderr });
  });
});

const runResult = (command, args, options = {}) => new Promise((resolve, reject) => {
  execFile(command, args, options, (error, stdout, stderr) => {
    if (error && typeof error.code !== 'number') {
      reject(error);
      return;
    }
    resolve({ status: error?.code || 0, stdout, stderr });
  });
});

async function listFiles(root) {
  const result = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  }
  await walk(root);
  return result;
}

function parseEnvironmentTemplate(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error(`Malformed configuration template line: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
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

function isolatedEnvironment(overrides = {}) {
  const kept = ['HOME', 'LANG', 'LC_ALL', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR'];
  const env = Object.fromEntries(
    kept
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  return { ...env, NODE_PATH: '', ...overrides };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.zip || !args.result) throw new Error('Usage: --zip <builder-zip> --result <json-file>');
  const zip = path.resolve(args.zip);
  const resultFile = path.resolve(args.result);
  const cleanRoom = await fs.mkdtemp(path.join(os.tmpdir(), 'sitebuilder-builder-release-test-'));

  try {
    await run('/usr/bin/unzip', ['-q', zip, '-d', cleanRoom]);
    const packageRoot = path.join(cleanRoom, 'sitebuilder-data-api-windows');
    const appRoot = path.join(packageRoot, 'app');
    const nodeModulesRoot = path.join(appRoot, 'node_modules');
    const realAppRoot = await fs.realpath(appRoot);
    const realNodeModulesRoot = await fs.realpath(nodeModulesRoot);
    const mongodbPackageFile = path.join(nodeModulesRoot, 'mongodb', 'package.json');
    const bsonPackageFile = path.join(nodeModulesRoot, 'bson', 'package.json');
    const mongodbPackage = JSON.parse(await fs.readFile(mongodbPackageFile, 'utf8'));
    const bsonPackage = JSON.parse(await fs.readFile(bsonPackageFile, 'utf8'));

    const bsonInstallations = (await listFiles(nodeModulesRoot))
      .filter((file) => path.basename(file) === 'package.json' && path.basename(path.dirname(file)) === 'bson')
      .map((file) => path.relative(appRoot, file).replaceAll(path.sep, '/'))
      .sort();
    assert.deepEqual(bsonInstallations, ['node_modules/bson/package.json']);

    const dependencyProbe = await run(
      process.execPath,
      ['-e', `
        const fs = require('node:fs');
        const path = require('node:path');
        const { createRequire } = require('node:module');
        const appRoot = process.cwd();
        const appRequire = createRequire(path.join(appRoot, 'package.json'));
        const mongodbPackageFile = path.join(appRoot, 'node_modules', 'mongodb', 'package.json');
        const mongodbRequire = createRequire(mongodbPackageFile);
        const mongodbEntry = appRequire.resolve('mongodb');
        const bsonEntry = mongodbRequire.resolve('bson');
        const mongodb = appRequire('mongodb');
        const bson = mongodbRequire('bson');
        process.stdout.write(JSON.stringify({
          mongodbEntry,
          bsonEntry,
          mongodbLoaded: typeof mongodb.MongoClient === 'function',
          byteUtilsEncodeUTF8Into: typeof bson.ByteUtils?.encodeUTF8Into,
          mongodbVersion: JSON.parse(fs.readFileSync(mongodbPackageFile, 'utf8')).version,
          bsonVersion: JSON.parse(fs.readFileSync(path.join(appRoot, 'node_modules', 'bson', 'package.json'), 'utf8')).version
        }));
      `],
      { cwd: appRoot, env: isolatedEnvironment() },
    );
    const resolved = JSON.parse(dependencyProbe.stdout);
    assert.equal(resolved.mongodbLoaded, true);
    assert.equal(resolved.byteUtilsEncodeUTF8Into, 'function');
    assert.equal(resolved.mongodbVersion, mongodbPackage.version);
    assert.equal(resolved.bsonVersion, bsonPackage.version);
    assert.equal(
      path.resolve(resolved.mongodbEntry).startsWith(`${realNodeModulesRoot}${path.sep}`),
      true,
    );
    assert.equal(
      path.resolve(resolved.bsonEntry).startsWith(`${realNodeModulesRoot}${path.sep}`),
      true,
    );
    assert.equal(satisfiesCaret(bsonPackage.version, mongodbPackage.dependencies?.bson), true);

    const bootstrapSecret = 'bootstrap-secret-must-not-print';
    const bootstrap = await runResult(
      process.execPath,
      ['app/server/index.js'],
      {
        cwd: packageRoot,
        env: isolatedEnvironment({
          NODE_ENV: 'production',
          STORAGE_BACKEND: 'mongo',
          MONGODB_URI: `mongodb://${bootstrapSecret}@127.0.0.1:1/sitebuilder_bootstrap?serverSelectionTimeoutMS=50&connectTimeoutMS=50`,
          MONGODB_DB_NAME: 'sitebuilder_bootstrap',
          SERVER_PORT: '43991',
          ADMIN_API_KEY: 'synthetic-bootstrap-key',
          CORS_ORIGINS: 'http://localhost',
          REQUIRE_STARTUP_COLLECTIONS: 'false',
        }),
        timeout: 5000,
      },
    );
    const bootstrapOutput = `${bootstrap.stdout}${bootstrap.stderr}`;
    assert.equal(bootstrap.status, 1);
    assert.match(bootstrapOutput, /\[site-builder-api\] failed to start \(MongoServerSelectionError\)/u);
    assert.doesNotMatch(bootstrapOutput, new RegExp(bootstrapSecret, 'u'));

    const configuration = parseEnvironmentTemplate(
      await fs.readFile(path.join(packageRoot, 'CONFIGURATION.env.example'), 'utf8'),
    );
    const allowedConfigurationKeys = [
      'ADMIN_API_KEY',
      'CORS_ORIGINS',
      'MONGODB_DB_NAME',
      'MONGODB_URI',
      'NODE_ENV',
      'REQUIRE_STARTUP_COLLECTIONS',
      'SERVER_PORT',
      'SITE_COLLECTION_PREFIX',
      'STORAGE_BACKEND',
    ];
    assert.deepEqual(Object.keys(configuration).sort(), allowedConfigurationKeys);
    assert.equal(configuration.NODE_ENV, 'production');
    assert.equal(configuration.SERVER_PORT, '3001');
    assert.equal(configuration.MONGODB_URI, 'mongodb://127.0.0.1:27018/sitebuilder_site_data');
    assert.equal(configuration.MONGODB_DB_NAME, 'sitebuilder_site_data');
    assert.match(configuration.ADMIN_API_KEY, /required/u);
    assert.equal(configuration.CORS_ORIGINS.length > 0, true);

    const startCommand = await fs.readFile(path.join(packageRoot, 'START-LOCAL-SMOKE.cmd'), 'utf8');
    assert.match(startCommand, /validate-builder-smoke-env\.mjs/u);
    assert.match(startCommand, /MONGO_URI/u);
    assert.match(startCommand, /sitebuilder_hub/u);
    assert.match(startCommand, /SERVER_PORT 4100/u);

    const validBuilderEnvironment = {
      NODE_ENV: 'production',
      STORAGE_BACKEND: 'mongo',
      MONGODB_URI: 'mongodb://127.0.0.1:27018/sitebuilder_site_data',
      MONGODB_DB_NAME: 'sitebuilder_site_data',
      SERVER_PORT: '3001',
      ADMIN_API_KEY: 'synthetic-builder-key',
      CORS_ORIGINS: 'http://localhost',
    };
    const preflightCases = [
      {
        name: 'HUB MONGO_URI without Builder MONGODB_URI',
        env: { ...validBuilderEnvironment, MONGODB_URI: '', MONGO_URI: 'mongodb://do-not-print@127.0.0.1/sitebuilder_hub' },
      },
      {
        name: 'HUB database',
        env: { ...validBuilderEnvironment, MONGODB_URI: 'mongodb://do-not-print@127.0.0.1/sitebuilder_hub' },
      },
      {
        name: 'HUB port',
        env: { ...validBuilderEnvironment, SERVER_PORT: '4100' },
      },
    ];
    for (const preflightCase of preflightCases) {
      const preflight = await runResult(
        process.execPath,
        ['app/validate-builder-smoke-env.mjs'],
        { cwd: packageRoot, env: isolatedEnvironment(preflightCase.env) },
      );
      const output = `${preflight.stdout}${preflight.stderr}`;
      assert.equal(preflight.status, 2, `${preflightCase.name} was not rejected`);
      assert.match(output, /wrong HUB \.env was supplied/u);
      assert.doesNotMatch(output, /do-not-print/u);
    }
    const validPreflight = await runResult(
      process.execPath,
      ['app/validate-builder-smoke-env.mjs'],
      { cwd: packageRoot, env: isolatedEnvironment(validBuilderEnvironment) },
    );
    assert.equal(validPreflight.status, 0);
    assert.match(validPreflight.stdout, /Builder environment preflight passed/u);

    const result = {
      ok: true,
      zip,
      cleanRoomExtractionOutsideRepository: cleanRoom,
      mongodbVersion: mongodbPackage.version,
      bsonVersion: bsonPackage.version,
      mongodbBsonRequirement: mongodbPackage.dependencies.bson,
      bsonInstallations,
      resolvedMongoDbEntry: path.relative(realAppRoot, resolved.mongodbEntry).replaceAll(path.sep, '/'),
      resolvedBsonEntry: path.relative(realAppRoot, resolved.bsonEntry).replaceAll(path.sep, '/'),
      sourceRepositoryNodeModulesUsed: false,
      checks: [
        'final ZIP extracted outside the source repository',
        'require("mongodb") succeeds',
        'mongodb resolves the packaged bson installation',
        'mongodb and bson versions satisfy the driver dependency range',
        'ByteUtils.encodeUTF8Into exists',
        'packaged server reaches its bootstrap error handler',
        'Builder-only configuration template',
        'HUB environment preflight guards reject without printing secrets',
      ],
    };
    await fs.mkdir(path.dirname(resultFile), { recursive: true });
    await fs.writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await fs.rm(cleanRoom, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Packaged Builder verification failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
