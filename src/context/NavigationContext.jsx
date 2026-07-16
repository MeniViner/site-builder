import React, { createContext, useMemo, useContext, useCallback } from 'react';
import { useConfig } from './ConfigProvider';
import { normalizeLinkTarget } from '../utils/linkTargets';
import { createNavigationNodeId, getNavigationChildren, getNavigationKind, getNavigationUrl } from '../utils/navigationModel';
import { useOptimisticBranchPersistence } from './useOptimisticBranchPersistence';

const NavigationContext = createContext();

export const useNavigation = () => useContext(NavigationContext);

function resolveNodeId(nodeOrId) {
    if (typeof nodeOrId === 'string') return nodeOrId;
    if (typeof nodeOrId === 'number') return String(nodeOrId);
    if (nodeOrId && typeof nodeOrId === 'object' && nodeOrId.id !== undefined) {
        return String(nodeOrId.id);
    }
    return null;
}

function asText(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function pickText(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return '';
}

function toLegacyNavItems(items) {
    const source = Array.isArray(items) ? items : [];

    return source.map((l1, l1Index) => {
        const l1Id = resolveNodeId(l1?.id) || `nav_${l1Index + 1}`;
        const l1Children = getNavigationChildren(l1);

        return {
            id: l1Id,
            label: pickText(l1?.label, l1?.title),
            kind: getNavigationKind(l1),
            icon: asText(l1?.icon),
            iconUrl: pickText(l1?.iconUrl, l1?.imageUrl, l1?.image),
            url: normalizeLinkTarget(getNavigationUrl(l1)),
            children: l1Children.map((l2, l2Index) => {
                const l2Id = resolveNodeId(l2?.id) || `${l1Id}_sub_${l2Index + 1}`;
                const l2Children = getNavigationChildren(l2);
                const title = pickText(l2?.title, l2?.label);

                return {
                    id: l2Id,
                    title,
                    label: title,
                    kind: getNavigationKind(l2),
                    icon: asText(l2?.icon),
                    iconUrl: pickText(l2?.iconUrl, l2?.imageUrl, l2?.image),
                    url: normalizeLinkTarget(getNavigationUrl(l2)),
                    subLinks: l2Children.map((l3, l3Index) => ({
                        id: resolveNodeId(l3?.id) || `${l2Id}_link_${l3Index + 1}`,
                        label: pickText(l3?.label, l3?.title),
                        kind: getNavigationKind(l3),
                        icon: asText(l3?.icon),
                        iconUrl: pickText(l3?.iconUrl, l3?.imageUrl, l3?.image),
                        url: normalizeLinkTarget(getNavigationUrl(l3)),
                    })),
                };
            }),
        };
    });
}

function toV1NavItems(legacyItems) {
    const source = Array.isArray(legacyItems) ? legacyItems : [];

    return source.map((l1) => {
        const l1Id = resolveNodeId(l1?.id) || createNavigationNodeId('nav_l1');
        const l1Children = getNavigationChildren(l1);

        return {
            id: l1Id,
            label: pickText(l1?.label, l1?.title),
            kind: getNavigationKind(l1),
            icon: asText(l1?.icon),
            iconUrl: pickText(l1?.iconUrl, l1?.imageUrl, l1?.image),
            url: normalizeLinkTarget(getNavigationUrl(l1)),
            children: l1Children.map((l2) => {
                const l2Id = resolveNodeId(l2?.id) || createNavigationNodeId('nav_l2');
                const l2Children = getNavigationChildren(l2);

                return {
                    id: l2Id,
                    label: pickText(l2?.title, l2?.label),
                    kind: getNavigationKind(l2),
                    icon: asText(l2?.icon),
                    iconUrl: pickText(l2?.iconUrl, l2?.imageUrl, l2?.image),
                    url: normalizeLinkTarget(getNavigationUrl(l2)),
                    children: l2Children.map((l3) => ({
                        id: resolveNodeId(l3?.id) || createNavigationNodeId('nav_l3'),
                        label: pickText(l3?.label, l3?.title),
                        kind: getNavigationKind(l3),
                        icon: asText(l3?.icon),
                        iconUrl: pickText(l3?.iconUrl, l3?.imageUrl, l3?.image),
                        url: normalizeLinkTarget(getNavigationUrl(l3)),
                        children: [],
                    })),
                };
            }),
        };
    });
}

function keepChildShape(node, nextChildren) {
    if (Array.isArray(node?.children)) return { children: nextChildren };
    if (Array.isArray(node?.subLinks)) return { subLinks: nextChildren };
    return {};
}

function normalizeNodePatch(node, patch) {
    if (!patch || typeof patch !== 'object') return {};
    const nextPatch = { ...patch };
    const hasTitle = Object.prototype.hasOwnProperty.call(nextPatch, 'title');
    const hasLabel = Object.prototype.hasOwnProperty.call(nextPatch, 'label');

    if (hasTitle && !hasLabel) {
        nextPatch.label = nextPatch.title;
    }

    if (hasLabel && !hasTitle && (Object.prototype.hasOwnProperty.call(node || {}, 'title') || Array.isArray(node?.subLinks))) {
        nextPatch.title = nextPatch.label;
    }

    return nextPatch;
}

function updateNodeById(nodes, targetId, updater) {
    if (!Array.isArray(nodes)) return nodes;
    return nodes.map((node) => {
        const nodeId = resolveNodeId(node?.id);
        const children = Array.isArray(node?.children)
            ? node.children
            : (Array.isArray(node?.subLinks) ? node.subLinks : []);
        const nextChildren = updateNodeById(children, targetId, updater);
        if (nodeId === targetId) {
            const updated = updater(node);
            return {
                ...updated,
                ...(Array.isArray(updated?.children)
                    ? { children: updated.children }
                    : (Array.isArray(updated?.subLinks) ? { subLinks: updated.subLinks } : keepChildShape(node, nextChildren))),
            };
        }
        return {
            ...node,
            ...keepChildShape(node, nextChildren),
        };
    });
}

function updateNestedNode(nodes, parentId, childId, updater) {
    return updateNodeById(nodes, parentId, (parent) => {
        const children = Array.isArray(parent?.children) ? parent.children : [];
        return {
            ...parent,
            children: children.map((child) => {
                if (resolveNodeId(child?.id) !== childId) return child;
                return updater(child);
            }),
        };
    });
}

export const NavigationProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();

    const patchNavigationConfig = useCallback((prev, items) => ({
        ...prev,
        navigation: {
            ...prev.navigation,
            items,
        },
    }), []);

    const {
        value: persistedItems,
        commit,
        flush,
        retry,
        saving,
        dirty,
        saveError,
        saveStatus,
    } = useOptimisticBranchPersistence({
        sourceValue: config?.navigation?.items,
        normalizeValue: toV1NavItems,
        patchConfig: patchNavigationConfig,
        updateConfig,
        saveNow,
    });

    const navItems = useMemo(
        () => toLegacyNavItems(persistedItems),
        [persistedItems]
    );

    const loading = status === 'loading';

    const fetchNavigation = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch {
            return false;
        }
    }, [reload]);

    const saveNavItems = useCallback((newNavItemsOrUpdater) => commit((currentItems) => {
        const currentLegacyItems = toLegacyNavItems(currentItems);
        const resolved = typeof newNavItemsOrUpdater === 'function'
            ? newNavItemsOrUpdater(currentLegacyItems)
            : newNavItemsOrUpdater;
        return toV1NavItems(resolved);
    }), [commit]);

    const saveNavigation = useCallback((newNavItems) => saveNavItems(newNavItems), [saveNavItems]);

    const updateNavItem = useCallback(async (itemOrId, patch) => {
        const targetId = resolveNodeId(itemOrId);
        if (!targetId) return false;

        return saveNavItems((currentItems) =>
            updateNodeById(currentItems, targetId, (node) => ({
                ...node,
                ...normalizeNodePatch(node, patch),
            }))
        );
    }, [saveNavItems]);

    const updateSubItem = useCallback(async (parentOrId, childOrId, patch) => {
        const parentId = resolveNodeId(parentOrId);
        const childId = resolveNodeId(childOrId);
        if (!parentId || !childId) return false;

        return saveNavItems((currentItems) =>
            updateNestedNode(currentItems, parentId, childId, (node) => ({
                ...node,
                ...normalizeNodePatch(node, patch),
            }))
        );
    }, [saveNavItems]);

    const updateSubLink = useCallback(async (parentOrId, childOrId, linkOrId, patch) => {
        const parentId = resolveNodeId(parentOrId);
        const childId = resolveNodeId(childOrId);
        const linkId = resolveNodeId(linkOrId);
        if (!parentId || !childId || !linkId) return false;

        return saveNavItems((currentItems) => updateNodeById(currentItems, parentId, (parent) => {
            const children = Array.isArray(parent?.children) ? parent.children : [];
            return {
                ...parent,
                children: children.map((child) => {
                    if (resolveNodeId(child?.id) !== childId) return child;
                    const subChildren = Array.isArray(child?.subLinks)
                        ? child.subLinks
                        : (Array.isArray(child?.children) ? child.children : []);
                    return {
                        ...child,
                        subLinks: subChildren.map((subLink) => {
                            if (resolveNodeId(subLink?.id) !== linkId) return subLink;
                            return {
                                ...subLink,
                                ...normalizeNodePatch(subLink, patch),
                            };
                        }),
                    };
                }),
            };
        }));
    }, [saveNavItems]);

    return (
        <NavigationContext.Provider
            value={{
                navItems,
                loading,
                error: saveError?.message || error,
                saving,
                dirty,
                saveStatus,
                retrySave: retry,
                flushSave: flush,
                saveNavItems,
                saveNavigation,
                updateNavItem,
                updateSubItem,
                updateSubLink,
                fetchNavigation,
            }}
        >
            {children}
        </NavigationContext.Provider>
    );
};
