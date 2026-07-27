import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('production file explorer architecture', () => {
  it('keeps browser filesystem calls out of presentation components', () => {
    const page = read('src/pages/FileExplorerPage.jsx');
    for (const forbidden of [
      'window.showDirectoryPicker',
      '.getDirectoryHandle(',
      '.getFileHandle(',
      'indexedDB.',
      '<iframe',
      'fetch(',
    ]) {
      expect(page).not.toContain(forbidden);
    }
  });

  it('contains no server bridge, readiness, mapped-drive, or hard-coded share dependency', () => {
    const productionSources = [
      read('src/pages/FileExplorerPage.jsx'),
      read('src/services/fileExplorer/BrowserFileSystemAdapter.js'),
      read('src/services/fileExplorer/IndexedDbConnectionRegistry.js'),
      read('src/services/fileExplorer/connectionModel.js'),
      read('server/src/app.js'),
      read('scripts/build-production.mjs'),
      read('vite.config.js'),
    ].join('\n');
    for (const forbidden of [
      '/api/file-explorer',
      '/_site-builder/file-explorer',
      '__sitebuilder-local-file',
      'Windows Authentication',
      'loopback',
      'search-ms',
      'fileExplorerApiUrl',
      'fileExplorerBridgePath',
      'VITE_FILE_EXPLORER',
      'VITE_LOCAL_FILE_BRIDGE',
      'hrmazivfs',
      'Malnash',
    ]) {
      expect(productionSources).not.toContain(forbidden);
    }
  });

  it('keeps missing child directories and files non-fatal in the capability spike', () => {
    const spike = read('capability-spikes/windows-unc-picker/spike.js');
    expect(spike).toContain('currentRun.childDirectoryCheck = "not_applicable"');
    expect(spike).toContain('currentRun.fileMetadataCheck = "not_applicable"');
    expect(spike).not.toContain('No child directory was found in the selected folder.');
    expect(spike).not.toContain('No readable file was found within depth');
  });
});
