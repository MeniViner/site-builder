import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * OPTIONAL machine-local developer secret source for the DEV AI engine.
 *
 * The file lives outside the repository on purpose: it is never tracked by Git,
 * never copied into the repo, and never read by Vite's client pipeline. Only the
 * Node side (Vite dev server process / Express dev server / diagnostic scripts)
 * ever touches it, and only when NODE_ENV is not "production".
 */
export const DEV_AI_SECRET_FILE_RELATIVE_PATH = path.join('.config', 'site-builder', 'dev-ai.env');

/** Keys the DEV AI engine is allowed to pick up from a file source. */
export const DEV_AI_ENV_KEY_PATTERN = /^(DEV_AI_[A-Z0-9_]+|GROQ_API_KEY)$/u;

export function pickDevAiEnvKeys(values = {}) {
  const picked = {};
  for (const [key, value] of Object.entries(values)) {
    if (DEV_AI_ENV_KEY_PATTERN.test(key)) picked[key] = value;
  }
  return picked;
}

export function getDevAiSecretFilePath(env = process.env, homedir = os.homedir()) {
  const explicit = String(env.DEV_AI_SECRET_FILE || '').trim();
  if (explicit) return explicit;
  return path.join(homedir, DEV_AI_SECRET_FILE_RELATIVE_PATH);
}

export function parseDevAiEnvText(text = '') {
  const values = {};
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIndex = withoutExport.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = withoutExport.slice(0, eqIndex).trim();
    let value = withoutExport.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

/**
 * Reads the optional developer secret file.
 *
 * Returns only a presence/diagnostic envelope plus the raw values; callers must
 * never log `values`. In production the file is not read at all, so a stray
 * deployment cannot pick up a developer's local Groq key.
 */
export function loadDevAiSecretFile({
  env = process.env,
  nodeEnv = env.NODE_ENV,
  readFile = (target) => fs.readFileSync(target, 'utf8'),
  homedir = os.homedir(),
} = {}) {
  const filePath = getDevAiSecretFilePath(env, homedir);

  if (String(nodeEnv || '').trim() === 'production') {
    return { exists: false, path: filePath, skippedForProduction: true, values: {}, keys: [] };
  }

  let text;
  try {
    text = readFile(filePath);
  } catch {
    return { exists: false, path: filePath, skippedForProduction: false, values: {}, keys: [] };
  }

  const values = parseDevAiEnvText(text);
  return {
    exists: true,
    path: filePath,
    skippedForProduction: false,
    values,
    // Key NAMES are safe to surface in diagnostics. Values never are.
    keys: Object.keys(values),
  };
}

/**
 * Reads the repository-local server environment file (server/.env.local), which
 * is git-ignored and is where a developer normally keeps non-secret DEV AI
 * settings. Only DEV AI keys are picked up; the rest of the server environment
 * (Mongo URI, admin key, ...) is deliberately ignored.
 */
export function loadDevAiServerEnvFile({
  env = process.env,
  nodeEnv = env.NODE_ENV,
  filePath,
  readFile = (target) => fs.readFileSync(target, 'utf8'),
} = {}) {
  const resolvedPath = filePath
    || String(env.DEV_AI_SERVER_ENV_FILE || '').trim()
    || path.resolve(process.cwd(), 'server', '.env.local');

  if (String(nodeEnv || '').trim() === 'production') {
    return { exists: false, path: resolvedPath, skippedForProduction: true, values: {}, keys: [] };
  }

  let text;
  try {
    text = readFile(resolvedPath);
  } catch {
    return { exists: false, path: resolvedPath, skippedForProduction: false, values: {}, keys: [] };
  }

  const values = pickDevAiEnvKeys(parseDevAiEnvText(text));
  return { exists: true, path: resolvedPath, skippedForProduction: false, values, keys: Object.keys(values) };
}

/**
 * Merge precedence (highest first):
 *   1. explicit process environment
 *   2. repository-local server environment file (server/.env.local)
 *   3. machine-local DEV secret file (~/.config/site-builder/dev-ai.env)
 *   4. safe defaults (applied later, in resolveDevAiConfig)
 *
 * An explicitly supplied, non-empty value is never overwritten by a lower source.
 */
export function mergeDevAiEnv(processEnv = {}, ...lowerPrioritySources) {
  const merged = { ...processEnv };
  const sources = {};

  for (const key of Object.keys(processEnv)) sources[key] = 'environment';

  for (const source of lowerPrioritySources) {
    const { label = 'secret-file', values = source || {} } = source && source.values !== undefined
      ? source
      : { values: source || {} };

    for (const [key, value] of Object.entries(values)) {
      const existing = merged[key];
      if (typeof existing === 'string' && existing.trim() !== '') continue;
      merged[key] = value;
      sources[key] = label;
    }
  }

  return { env: merged, sources };
}
