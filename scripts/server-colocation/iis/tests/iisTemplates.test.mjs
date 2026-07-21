import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(directory, name), 'utf8');

test('web.config is an iisnode-only template with no public binding or secret', () => {
  const template = read('web.config.template');
  assert.match(template, /modules="iisnode"/);
  assert.match(template, /__NODE_ENTRY__/);
  assert.match(template, /loggingEnabled="false"/);
  assert.doesNotMatch(template, /MONGODB_URI|ADMIN_API_KEY|JWT_SECRET|password|127\.0\.0\.1:\d+/i);
});

test('installer is dry-run by default and fails closed for any mutation', () => {
  const script = read('Install-BuilderIis.ps1');
  assert.match(script, /\[string\]\$Mode = 'DryRun'/);
  assert.match(script, /-Confirm SITEBUILDER_IIS_INSTALL/);
  assert.match(script, /ListenAddress must be 127\.0\.0\.1 or ::1/);
  assert.match(script, /if \(Test-Path "IIS:\\\\Sites\\\\\$SiteName"\).*Refusing to alter it/s);
  assert.match(script, /if \(Test-Path "IIS:\\\\AppPools\\\\\$AppPoolName"\).*Refusing to alter it/s);
  assert.match(script, /Get-WebGlobalModule -Name 'iisnode'/);
  assert.match(script, /managedRuntimeVersion -Value ''/);
  assert.match(script, /modifiesHub = \$false/);
});

test('rollback preserves files and Mongo and requires its own explicit confirmation', () => {
  const script = read('Rollback-BuilderIis.ps1');
  assert.match(script, /\[string\]\$Mode = 'DryRun'/);
  assert.match(script, /-Confirm SITEBUILDER_IIS_ROLLBACK/);
  assert.match(script, /deploymentFilesPreserved = \$true/);
  assert.match(script, /mongodbPreserved = \$true/);
  assert.match(script, /physical path does not match DeploymentRoot/);
  assert.doesNotMatch(script, /Remove-Item|DropDatabase|Remove-Mongo/i);
});

test('health smoke refuses a non-loopback endpoint and does not use an authenticated route', () => {
  const script = read('Test-BuilderIisHealth.ps1');
  assert.match(script, /refuses non-loopback addresses/);
  assert.match(script, /\/healthz/);
  assert.doesNotMatch(script, /\/api\//);
  assert.doesNotMatch(script, /ADMIN_API_KEY|MONGODB_URI/);
});

test('Windows launchers remain offline and delegate only to the local PowerShell scripts', () => {
  for (const launcher of ['INSTALL-IIS-DRY-RUN.cmd', 'INSTALL-IIS.cmd', 'START-SMOKE.cmd', 'VERIFY-HEALTH.cmd', 'ROLLBACK-IIS.cmd']) {
    const content = read(launcher);
    assert.match(content, /powershell\.exe -NoLogo -NoProfile -ExecutionPolicy Bypass/);
    assert.doesNotMatch(content, /npm|node_modules|https?:\/\/|curl|Invoke-WebRequest/i);
  }
  assert.match(read('INSTALL-IIS.cmd'), /SITEBUILDER_IIS_INSTALL/);
  assert.match(read('ROLLBACK-IIS.cmd'), /SITEBUILDER_IIS_ROLLBACK/);
});
