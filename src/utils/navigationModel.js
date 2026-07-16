const FOLDER_KINDS = new Set(['folder', 'directory', 'category', 'container']);
const LINK_KINDS = new Set(['link', 'url', 'network-folder', 'network-link']);
const RESERVED_BROWSER_TARGETS = new Set(['_blank', '_self', '_parent', '_top']);

function asTrimmedText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function createNavigationNodeId(prefix = 'nav') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getNavigationChildren(node) {
    if (Array.isArray(node?.children)) return node.children;
    if (Array.isArray(node?.subLinks)) return node.subLinks;
    return [];
}

export function getNavigationUrl(node) {
    const candidates = [node?.url, node?.path, node?.href, node?.folderPath, node?.target];
    for (const candidate of candidates) {
        const value = asTrimmedText(candidate);
        if (!value || RESERVED_BROWSER_TARGETS.has(value.toLowerCase())) continue;
        return value;
    }
    return '';
}

export function getNavigationKind(node) {
    const explicitKind = asTrimmedText(node?.kind || node?.type).toLowerCase();
    if (FOLDER_KINDS.has(explicitKind)) return 'folder';
    if (LINK_KINDS.has(explicitKind)) return 'link';

    const children = getNavigationChildren(node);
    if (children.length > 0 || !getNavigationUrl(node)) return 'folder';
    return 'link';
}

export function getNavigationNodeModel(node) {
    const children = getNavigationChildren(node);
    const url = getNavigationUrl(node);
    const kind = getNavigationKind(node);

    return {
        node,
        kind,
        url,
        children,
        canOpen: Boolean(url),
        canExplore: children.length > 0,
        isHybrid: Boolean(url) && children.length > 0,
        isEmptyFolder: kind === 'folder' && children.length === 0 && !url,
    };
}

export function shouldExploreNavigationNode(node) {
    return getNavigationNodeModel(node).canExplore;
}
