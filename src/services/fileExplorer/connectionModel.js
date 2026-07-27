import { normalizeUncComparisonPart } from '../../utils/fileExplorerTargets';

export const CONNECTION_MODES = Object.freeze({
  SHARE_ROOT: 'share-root',
  FOLDER_PREFIX: 'folder-prefix',
  INTERMEDIATE_PREFIX: 'intermediate-prefix',
});

function samePart(left, right) {
  return normalizeUncComparisonPart(left) === normalizeUncComparisonPart(right);
}

export function canonicalConnectionPrefix(target, prefixSegments = []) {
  if (target?.kind !== 'unc' || !target.shareKey) return '';
  return [
    target.shareKey,
    ...prefixSegments.map(normalizeUncComparisonPart),
  ].join('/');
}

export function displayConnectionPrefix(target, prefixSegments = []) {
  if (target?.kind !== 'unc') return '';
  return `\\\\${target.server}\\${[target.share, ...prefixSegments].join('\\')}`;
}

export function connectionContainsTarget(connection, target) {
  if (!connection || target?.kind !== 'unc' || connection.shareKey !== target.shareKey) return false;
  const prefixSegments = Array.isArray(connection.prefixSegments) ? connection.prefixSegments : [];
  if (prefixSegments.length > target.segments.length) return false;
  return prefixSegments.every((segment, index) => samePart(segment, target.segments[index]));
}

export function selectLongestPrefixConnection(target, connections = []) {
  return connections
    .filter((connection) => connectionContainsTarget(connection, target))
    .sort((left, right) => {
      const segmentDifference = (right.prefixSegments?.length || 0) - (left.prefixSegments?.length || 0);
      if (segmentDifference) return segmentDifference;
      return String(right.lastUsedAt || right.createdAt || '').localeCompare(String(left.lastUsedAt || left.createdAt || ''));
    })[0] || null;
}

function candidate(target, prefixSegments, connectionMode, selectedName, reliable = true) {
  return {
    canonicalPrefix: canonicalConnectionPrefix(target, prefixSegments),
    connectionMode,
    displayPrefix: displayConnectionPrefix(target, prefixSegments),
    prefixSegments,
    reliable,
    remainingSegments: target.segments.slice(prefixSegments.length),
    selectedName,
  };
}

export function inferConnectionCandidates(target, selectedHandleName) {
  if (target?.kind !== 'unc') return { candidates: [], status: 'invalid-target' };
  const selectedName = String(selectedHandleName || '').trim();
  if (!selectedName) {
    return {
      candidates: [candidate(target, target.segments, CONNECTION_MODES.FOLDER_PREFIX, '', false)],
      status: 'confirmation-required',
    };
  }

  const candidates = [];
  if (samePart(selectedName, target.share)) {
    candidates.push(candidate(target, [], CONNECTION_MODES.SHARE_ROOT, selectedName));
  }
  target.segments.forEach((segment, index) => {
    if (!samePart(selectedName, segment)) return;
    const prefixSegments = target.segments.slice(0, index + 1);
    candidates.push(candidate(
      target,
      prefixSegments,
      index === target.segments.length - 1
        ? CONNECTION_MODES.FOLDER_PREFIX
        : CONNECTION_MODES.INTERMEDIATE_PREFIX,
      selectedName,
    ));
  });

  if (candidates.length === 1) return { candidates, status: 'ready' };
  if (candidates.length > 1) return { candidates, status: 'choice-required' };
  return {
    candidates: [candidate(target, target.segments, CONNECTION_MODES.FOLDER_PREFIX, selectedName, false)],
    status: 'confirmation-required',
  };
}

export function remainingSegmentsForConnection(connection, target) {
  if (!connectionContainsTarget(connection, target)) return null;
  return target.segments.slice(connection.prefixSegments.length);
}
