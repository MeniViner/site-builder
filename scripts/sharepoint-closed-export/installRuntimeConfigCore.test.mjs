import { describe, expect, it } from 'vitest';
import path from 'path';
import {
  buildRuntimeConfigPayload,
  resolveRuntimeConfigPlan,
} from './installRuntimeConfigCore.mjs';
import {
  installRuntimeConfig,
} from './installRuntimeConfigCore.mjs';

const makeFsStub = ({ files }) => ({
  existsSync: (target) => files.includes(target),
  mkdirSync: () => {
    files.push(path.join('created', 'dir'));
  },
  writeFileSync: (target, content) => {
    files.push(`${target}:${content.length}`);
  },
});

const config = {
  siteCode: 'demo-site',
  host: 'portal.example',
  distRel: '/sites/demo-site/siteDB/dist',
  toWebDav: (serverRelativePath) => `WEB_DAV:${serverRelativePath}`,
};

describe('runtime config core', () => {
  it('resolves runtime config file plans and payload', () => {
    const plan = resolveRuntimeConfigPlan({
      config,
      cli: {
        site: 'demo-site',
        'backend-url': 'http://127.0.0.1:3001',
        'api-key': 'dev-key',
        'site-id': 'local-site',
      },
    });

  expect(plan.runtimeConfigRel).toBe('/sites/demo-site/siteDB/dist/sitebuilder-runtime-config.json');
    expect(plan.runtimeConfigUrl).toBe('https://portal.example/sites/demo-site/siteDB/dist/sitebuilder-runtime-config.json');
    expect(buildRuntimeConfigPayload(plan).siteId).toBe('local-site');
  });

  it('dry-runs runtime-config write without touching disk', () => {
    const plan = resolveRuntimeConfigPlan({
      config,
      cli: {
        site: 'demo-site',
        'backend-url': 'http://127.0.0.1:3001',
        'api-key': 'dev-key',
        'site-id': 'local-site',
      },
    });

    const result = installRuntimeConfig({
      plan,
      config,
      dryRun: true,
      fsAdapter: makeFsStub({ files: [] }),
    });

    expect(result.installed).toBe(false);
    expect(result.writes).toHaveLength(1);
    expect(result.writes[0].serverRelativePath).toBe(plan.runtimeConfigRel);
  });

  it('refuses to write runtime config when dist folder does not exist', () => {
    const plan = resolveRuntimeConfigPlan({
      config: {
        ...config,
        distRel: '/missing/siteDB/dist',
        toWebDav: (serverRelativePath) => `WEB_DAV:${serverRelativePath}`,
      },
      cli: {
        site: 'demo-site',
        'backend-url': 'http://127.0.0.1:3001',
        'api-key': 'dev-key',
        'site-id': 'local-site',
      },
    });

    expect(() => installRuntimeConfig({
      plan,
      config: {
        ...config,
        distRel: '/missing/siteDB/dist',
        toWebDav: (serverRelativePath) => `WEB_DAV:${serverRelativePath}`,
      },
      dryRun: false,
      fsAdapter: makeFsStub({ files: [] }),
    })).toThrow('dist folder does not exist');
  });
});
