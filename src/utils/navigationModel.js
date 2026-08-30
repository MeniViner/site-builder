const FOLDER_KINDS = new Set(['folder', 'directory', 'category', 'container']);
const LINK_KINDS = new Set(['link', 'url', 'network-folder', 'network-link']);
const RESERVED_BROWSER_TARGETS = new Set(['_blank', '_self', '_parent', '_top']);

export const NAVIGATION_TARGET_MODES = Object.freeze({
    MANUAL: 'manual',
    SHAREPOINT_AUTO: 'sharepoint-auto',
});

export const NAVIGATION_TARGET_KINDS = Object.freeze({
    URL: 'url',
    LIBRARY: 'library',
    FOLDER: 'folder',
});

function asTrimmedText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeServerRelativeUrl(value) {
    const raw = asTrimmedText(value);
    if (!raw) return '';
    let path = raw;
    if (/^https?:\/\//i.test(raw)) {
        try {
            path = new URL(raw).pathname;
        } catch {
            return '';
        }
    }
    const normalized = `/${path.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
    if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) return '';
    return normalized === '/' ? '' : normalized;
}

export function normalizeNavigationTargetBinding(bindingLike) {
    if (!bindingLike || typeof bindingLike !== 'object' || Array.isArray(bindingLike)) return undefined;

    if (bindingLike.mode === NAVIGATION_TARGET_MODES.MANUAL) {
        return {
            version: 1,
            mode: NAVIGATION_TARGET_MODES.MANUAL,
            targetKind: NAVIGATION_TARGET_KINDS.URL,
            state: 'manual',
        };
    }

    if (bindingLike.mode !== NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO) return undefined;
    const targetKind = bindingLike.targetKind === NAVIGATION_TARGET_KINDS.FOLDER
        ? NAVIGATION_TARGET_KINDS.FOLDER
        : NAVIGATION_TARGET_KINDS.LIBRARY;
    const serverRelativeUrl = normalizeServerRelativeUrl(bindingLike.serverRelativeUrl);
    const libraryRootServerRelativeUrl = normalizeServerRelativeUrl(
        bindingLike.libraryRootServerRelativeUrl
            || (targetKind === NAVIGATION_TARGET_KINDS.LIBRARY ? serverRelativeUrl : '')
    );
    if (!serverRelativeUrl || !libraryRootServerRelativeUrl) return undefined;

    return {
        version: 1,
        mode: NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO,
        targetKind,
        state: 'verified',
        serverRelativeUrl,
        listId: asTrimmedText(bindingLike.listId),
        libraryTitle: asTrimmedText(bindingLike.libraryTitle),
        libraryRootServerRelativeUrl,
        provisionKey: asTrimmedText(bindingLike.provisionKey),
    };
}

export function getNavigationTargetBinding(node) {
    return normalizeNavigationTargetBinding(node?.targetBinding);
}

export function getNavigationTargetMode(node) {
    return getNavigationTargetBinding(node)?.mode || NAVIGATION_TARGET_MODES.MANUAL;
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
