export function getListenTarget(config, env = process.env) {
  // iisnode supplies PORT as a named pipe.  A direct process receives the
  // configured numeric SERVER_PORT instead.
  const iisnodePort = String(env.PORT || '').trim();
  return iisnodePort || config.serverPort;
}

export function safeStartupErrorCode(error) {
  const code = String(error?.code || error?.name || 'startup_failed')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 80);
  return code || 'startup_failed';
}

export function installGracefulShutdown({ server, closeMongo, timeoutMs, logger = console, exit = process.exit }) {
  let stopping = false;

  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.log(`[site-builder-api] shutdown requested (${signal})`);

    const forceTimer = setTimeout(() => {
      logger.error('[site-builder-api] shutdown timed out');
      exit(1);
    }, timeoutMs);
    forceTimer.unref?.();

    try {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await closeMongo();
      clearTimeout(forceTimer);
      logger.log('[site-builder-api] shutdown complete');
      exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      logger.error(`[site-builder-api] shutdown failed (${safeStartupErrorCode(error)})`);
      exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  return shutdown;
}
