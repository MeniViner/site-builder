import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Static regression guard: the Groq credential must be structurally unable to
 * reach the browser. These checks are deliberately structural (identifier and
 * path based) rather than value based, so the real key is never read, printed
 * or embedded in a test.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'dist-universal', '.git', '.tmp-build', '.tmp-verify']);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(fullPath, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const frontendFiles = walk(path.join(projectRoot, 'src'));
// Test files are never part of the browser bundle, but they still may not carry
// a credential, so the GROQ_API_KEY check below covers them too.
const bundledFrontendFiles = frontendFiles.filter((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file));
const readFile = (file) => fs.readFileSync(file, 'utf8');
const relative = (file) => path.relative(projectRoot, file);

describe('the Groq key can never reach the browser bundle', () => {
  it('finds frontend sources to scan', () => {
    expect(frontendFiles.length).toBeGreaterThan(50);
    expect(bundledFrontendFiles.length).toBeGreaterThan(50);
  });

  it('never references GROQ_API_KEY anywhere under src/', () => {
    const offenders = frontendFiles.filter((file) => readFile(file).includes('GROQ_API_KEY')).map(relative);
    expect(offenders).toEqual([]);
  });

  it('never references any provider credential identifier in bundled frontend code', () => {
    const forbidden = ['GROQ_API_KEY', 'DEV_AI_GROQ_BASE_URL', 'api.groq.com', 'Bearer ${', 'VITE_GROQ'];
    const offenders = [];
    for (const file of bundledFrontendFiles) {
      const contents = readFile(file);
      for (const needle of forbidden) {
        if (contents.includes(needle)) offenders.push(`${relative(file)} -> ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('defines no VITE_-prefixed provider secret anywhere in the repository', () => {
    const envLikeFiles = fs.readdirSync(projectRoot)
      .filter((name) => name.startsWith('.env'))
      .map((name) => path.join(projectRoot, name))
      .concat(
        fs.readdirSync(path.join(projectRoot, 'server'))
          .filter((name) => name.startsWith('.env'))
          .map((name) => path.join(projectRoot, 'server', name)),
      );

    const offenders = [];
    for (const file of envLikeFiles) {
      for (const line of readFile(file).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const key = trimmed.split('=')[0].trim();
        if (!key.startsWith('VITE_')) continue;
        if (/GROQ|OLLAMA|API_KEY|SECRET|TOKEN/i.test(key.replace('VITE_SITE_BUILDER_DEV_API_KEY', ''))) {
          if (key === 'VITE_ALPHA_AI_API_TOKEN' || key === 'VITE_SITE_BUILDER_DEV_API_KEY' || key === 'VITE_SITE_BUILDER_API_KEY' || key === 'VITE_ADMIN_API_KEY') {
            // Pre-existing production/browser variables, unrelated to the DEV AI providers.
            continue;
          }
          offenders.push(`${relative(file)} -> ${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads the Groq key in exactly one server-side module', () => {
    const serverFiles = walk(path.join(projectRoot, 'server'));
    const scriptFiles = walk(path.join(projectRoot, 'scripts'));
    const readers = [...serverFiles, ...scriptFiles]
      .filter((file) => !file.includes('.test.'))
      .filter((file) => /\benv\.GROQ_API_KEY\b|process\.env\.GROQ_API_KEY/.test(readFile(file)))
      .map(relative);

    expect(readers).toEqual(['server/src/devAi/env.js']);
  });

  it('sends the Authorization header from exactly one server-side adapter', () => {
    const serverFiles = walk(path.join(projectRoot, 'server'));
    const senders = serverFiles
      .filter((file) => !file.includes('.test.'))
      .filter((file) => readFile(file).includes('Authorization: `Bearer'))
      .map(relative);

    expect(senders).toEqual(['server/src/devAi/providers/groq.js']);
  });

  it('keeps the developer secret file out of the repository and out of Git', () => {
    const gitignore = readFile(path.join(projectRoot, '.gitignore'));
    expect(gitignore).toMatch(/dev-ai\.env|\*\.local/);

    const tracked = walk(projectRoot).map(relative);
    expect(tracked.some((file) => file.includes('dev-ai.env'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'dev-ai.env'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, '.config'))).toBe(false);
  });

  it('gates the frontend on the token Vite statically replaces in production', () => {
    const aiConfig = readFile(path.join(projectRoot, 'src/config/ai.config.js'));
    // Vite rewrites the literal `import.meta.env.DEV` to `false` in a production
    // build. The gate must therefore use that exact expression, not an aliased
    // or destructured read that would survive as a runtime lookup.
    expect(aiConfig).toContain('import.meta.env && import.meta.env.DEV === true');
    expect(aiConfig).not.toMatch(/const\s*\{\s*DEV\s*[,}]/);
  });

  it('leaves no provider credential in a built bundle', () => {
    const distDirectory = path.join(projectRoot, 'dist', 'assets');
    if (!fs.existsSync(distDirectory)) {
      // Nothing has been built in this working tree; the source-level checks above
      // are the guard. `node scripts/build-legacy.mjs` makes this check meaningful.
      expect(true).toBe(true);
      return;
    }

    const bundles = fs.readdirSync(distDirectory).filter((name) => name.endsWith('.js'));
    expect(bundles.length).toBeGreaterThan(0);

    // Provider identity and credential markers. A generic 'Bearer ' needle would
    // match the app's pre-existing log-redaction regex, so the provider host and
    // the credential variable names are the discriminating signals.
    const forbidden = [
      'GROQ_API_KEY',
      'api.groq.com',
      'VITE_GROQ',
      'DEV_AI_GROQ',
      'reasoning_format',
      'max_completion_tokens',
      '11434',
    ];
    const offenders = [];
    for (const name of bundles) {
      const contents = fs.readFileSync(path.join(distDirectory, name), 'utf8');
      for (const needle of forbidden) {
        if (contents.includes(needle)) offenders.push(`${name} -> ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the DEV AI frontend transport free of provider identity', () => {
    const aiConfig = readFile(path.join(projectRoot, 'src/config/ai.config.js'));
    expect(aiConfig).toContain("apiBase: '/api/dev-ai'");
    expect(aiConfig).not.toMatch(/https?:\/\/[^'"`\s]*groq/i);
    expect(aiConfig).not.toContain('11434');
  });
});
