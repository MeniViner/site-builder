import { describe, expect, it, vi } from 'vitest';
import { getListenTarget, installGracefulShutdown, safeStartupErrorCode } from './serverRuntime.js';

describe('server runtime', () => {
  it('uses iisnode PORT before SERVER_PORT and keeps direct startup numeric', () => {
    expect(getListenTarget({ serverPort: 3001 }, { PORT: '\\\\.\\pipe\\iisnode-test' })).toBe('\\\\.\\pipe\\iisnode-test');
    expect(getListenTarget({ serverPort: 3001 }, {})).toBe(3001);
  });

  it('does not expose an error message in startup log codes', () => {
    expect(safeStartupErrorCode({ code: 'MongoServerSelectionError', message: 'mongodb://secret@host' }))
      .toBe('MongoServerSelectionError');
  });

  it('closes the HTTP listener before Mongo on shutdown', async () => {
    const calls = [];
    const server = { close: (callback) => { calls.push('server'); callback(); } };
    const closeMongo = vi.fn(async () => { calls.push('mongo'); });
    const exit = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };
    const shutdown = installGracefulShutdown({ server, closeMongo, timeoutMs: 1000, logger, exit });

    await shutdown('test');
    expect(calls).toEqual(['server', 'mongo']);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
