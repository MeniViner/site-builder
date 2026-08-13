export function createLegacyDeploymentPlan(config, librariesReady) {
  const deployMode = librariesReady ? 'final' : 'bootstrap';
  const targetRel = librariesReady ? config.distRel : config.bootstrapDistRel;
  return Object.freeze({
    librariesReady: Boolean(librariesReady),
    deployMode,
    targetRel,
    targetDir: config.toWebDav(targetRel),
    setupUrl: librariesReady ? 'n/a' : `https://${config.host}${config.bootstrapDistRel}/index.html#/admin/sharepoint-setup`,
  });
}
