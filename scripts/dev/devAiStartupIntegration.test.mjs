import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { devAiVitePlugin } from './viteDevAiPlugin.mjs';

/**
 * `npm run dev` must start everything the DEV AI engine needs, with no second
 * gateway process and no extra terminal.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

function fakeViteServer() {
  const mounts = [];
  return {
    mounts,
    middlewares: { use: (mountPath, middleware) => mounts.push({ mountPath, middleware }) },
    config: { logger: { info: vi.fn() } },
  };
}

describe('npm run dev exposes the DEV AI gateway automatically', () => {
  it('registers the plugin in the shared Vite configuration', () => {
    // Read as text: importing vite.config.js would pull esbuild into the jsdom
    // test environment, which is unrelated to what this test asserts.
    const viteConfigSource = fs.readFileSync(path.join(projectRoot, 'vite.config.js'), 'utf8');
    expect(viteConfigSource).toContain("import { devAiVitePlugin } from './scripts/dev/viteDevAiPlugin.mjs'");
    expect(viteConfigSource).toMatch(/plugins:\s*\[[^\]]*devAiVitePlugin\(\)/);

    const plugin = devAiVitePlugin();
    expect(plugin.name).toBe('site-builder-dev-ai');
    expect(plugin.apply).toBe('serve');
    expect(typeof plugin.configureServer).toBe('function');
  });

  it('never applies to a production build', () => {
    // `apply: 'serve'` is what Vite itself uses to exclude the plugin from `vite build`.
    expect(devAiVitePlugin().apply).toBe('serve');
  });

  it('mounts the middleware on the development server', () => {
    const server = fakeViteServer();
    devAiVitePlugin({ nodeEnv: 'development' }).configureServer(server);

    expect(server.mounts).toHaveLength(1);
    expect(server.mounts[0].mountPath).toBe('/api/dev-ai');
    expect(typeof server.mounts[0].middleware).toBe('function');
  });

  it('mounts nothing when NODE_ENV is production', () => {
    const server = fakeViteServer();
    devAiVitePlugin({ nodeEnv: 'production' }).configureServer(server);

    expect(server.mounts).toHaveLength(0);
    expect(server.config.logger.info).toHaveBeenCalledWith('[dev-ai] skipped: NODE_ENV=production');
  });

  it('starts Vite from the full local stack, so no separate gateway process is needed', () => {
    const startLocalStack = fs.readFileSync(path.join(projectRoot, 'scripts/dev/start-local-stack.mjs'), 'utf8');
    expect(packageJson.scripts.dev).toBe('node scripts/dev/start-local-stack.mjs');
    expect(startLocalStack).toContain('viteBin');
    expect(startLocalStack).toContain('spawnChild(process.execPath, [viteBin');
    // No DEV AI process of its own.
    expect(startLocalStack).not.toContain('dev-ai');
  });

  it('exposes the diagnostic commands', () => {
    expect(packageJson.scripts['dev:ai:check']).toBe('node scripts/dev/dev-ai-check.mjs');
    expect(packageJson.scripts['dev:ai:models']).toBe('node scripts/dev/dev-ai-check.mjs --models');
    expect(packageJson.scripts['dev:ai:smoke']).toBe('node scripts/dev/dev-ai-smoke.mjs');
  });

  it('never runs a paid smoke request from a build, test or lifecycle script', () => {
    const offenders = Object.entries(packageJson.scripts)
      .filter(([name]) => !name.startsWith('dev:ai:smoke'))
      .filter(([, command]) => command.includes('dev-ai-smoke'))
      .map(([name]) => name);

    expect(offenders).toEqual([]);
    for (const name of ['build', 'test', 'lint', 'preview', 'postbuild', 'server:test']) {
      expect(packageJson.scripts[name] || '').not.toContain('dev-ai');
    }
  });
});
