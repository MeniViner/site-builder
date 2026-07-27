import { describe, expect, it } from 'vitest';
import { parseFileExplorerTarget } from '../../utils/fileExplorerTargets';
import {
  CONNECTION_MODES,
  inferConnectionCandidates,
  remainingSegmentsForConnection,
  selectLongestPrefixConnection,
} from './connectionModel';

describe('file explorer connection model', () => {
  const target = parseFileExplorerTarget('\\\\Server-A\\Team Share\\Alpha\\Beta\\Reports');

  it('selects the longest matching prefix across many servers and shares', () => {
    const connections = [
      { id: 'other-server', prefixSegments: [], shareKey: 'unc://server-b/team share' },
      { id: 'other-share', prefixSegments: [], shareKey: 'unc://server-a/finance' },
      { id: 'root', prefixSegments: [], shareKey: target.shareKey },
      { id: 'alpha', prefixSegments: ['alpha'], shareKey: target.shareKey },
      { id: 'beta', prefixSegments: ['ALPHA', 'beta'], shareKey: target.shareKey },
    ];
    const selected = selectLongestPrefixConnection(target, connections);
    expect(selected?.id).toBe('beta');
    expect(remainingSegmentsForConnection(selected, target)).toEqual(['Reports']);
  });

  it('infers share-root, intermediate-prefix, and folder-prefix mappings', () => {
    expect(inferConnectionCandidates(target, 'team share').candidates[0]).toMatchObject({
      connectionMode: CONNECTION_MODES.SHARE_ROOT,
      prefixSegments: [],
      remainingSegments: ['Alpha', 'Beta', 'Reports'],
    });
    expect(inferConnectionCandidates(target, 'Beta').candidates[0]).toMatchObject({
      connectionMode: CONNECTION_MODES.INTERMEDIATE_PREFIX,
      prefixSegments: ['Alpha', 'Beta'],
      remainingSegments: ['Reports'],
    });
    expect(inferConnectionCandidates(target, 'Reports').candidates[0]).toMatchObject({
      connectionMode: CONNECTION_MODES.FOLDER_PREFIX,
      prefixSegments: ['Alpha', 'Beta', 'Reports'],
      remainingSegments: [],
    });
  });

  it('requires a choice for duplicate matching segments and confirmation for an unknown name', () => {
    const repeated = parseFileExplorerTarget('\\\\Server-A\\Share\\Alpha\\Alpha\\Final');
    const choice = inferConnectionCandidates(repeated, 'alpha');
    expect(choice.status).toBe('choice-required');
    expect(choice.candidates).toHaveLength(2);

    const confirmation = inferConnectionCandidates(target, 'Local label');
    expect(confirmation).toMatchObject({ status: 'confirmation-required' });
    expect(confirmation.candidates[0]).toMatchObject({
      prefixSegments: ['Alpha', 'Beta', 'Reports'],
      reliable: false,
      remainingSegments: [],
    });
  });
});
