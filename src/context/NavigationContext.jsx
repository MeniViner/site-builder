import React, { createContext, useMemo, useContext, useCallback } from 'react';
import { useConfig } from './ConfigProvider';
import { normalizeLinkTarget } from '../utils/linkTargets';
import { spLog } from '../utils/spAppLog';

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

function createNodeId(prefix = 'nav') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toLegacyNavItems(items) {
    const source = Array.isArray(items) ? items : [];

    return source.map((l1, l1Index) => {
        const l1Id = resolveNodeId(l1?.id) || `nav_${l1Index + 1}`;
        const l1Children = Array.isArray(l1?.children) ? l1.children : [];

        return {
            id: l1Id,
            label: pickText(l1?.label, l1?.title),
            icon: asText(l1?.icon),
            iconUrl: pickText(l1?.iconUrl, l1?.imageUrl, l1?.image),
            url: normalizeLinkTarget(asText(l1?.url)),
            children: l1Children.map((l2, l2Index) => {
                const l2Id = resolveNodeId(l2?.id) || `${l1Id}_sub_${l2Index + 1}`;
                const l2Children = Array.isArray(l2?.children)
                    ? l2.children
                    : (Array.isArray(l2?.subLinks) ? l2.subLinks : []);
                const title = pickText(l2?.title, l2?.label);

                return {
                    id: l2Id,
                    title,
                    label: title,
                    icon: asText(l2?.icon),
                    iconUrl: pickText(l2?.iconUrl, l2?.imageUrl, l2?.image),
                    url: normalizeLinkTarget(asText(l2?.url)),
                    subLinks: l2Children.map((l3, l3Index) => ({
                        id: resolveNodeId(l3?.id) || `${l2Id}_link_${l3Index + 1}`,
                        label: pickText(l3?.label, l3?.title),
                        icon: asText(l3?.icon),
                        iconUrl: pickText(l3?.iconUrl, l3?.imageUrl, l3?.image),
                        url: normalizeLinkTarget(asText(l3?.url)),
                    })),
                };
            }),
        };
    });
}

function toV1NavItems(legacyItems) {
    const source = Array.isArray(legacyItems) ? legacyItems : [];

    return source.map((l1) => {
        const l1Id = resolveNodeId(l1?.id) || createNodeId('nav_l1');
        const l1Children = Array.isArray(l1?.children)
            ? l1.children
            : (Array.isArray(l1?.subLinks) ? l1.subLinks : []);

        return {
            id: l1Id,
            label: pickText(l1?.label, l1?.title),
            icon: asText(l1?.icon),
            iconUrl: pickText(l1?.iconUrl, l1?.imageUrl, l1?.image),
            url: normalizeLinkTarget(asText(l1?.url)),
            children: l1Children.map((l2) => {
                const l2Id = resolveNodeId(l2?.id) || createNodeId('nav_l2');
                const l2Children = Array.isArray(l2?.subLinks)
                    ? l2.subLinks
                    : (Array.isArray(l2?.children) ? l2.children : []);

                return {
                    id: l2Id,
                    label: pickText(l2?.title, l2?.label),
                    icon: asText(l2?.icon),
                    iconUrl: pickText(l2?.iconUrl, l2?.imageUrl, l2?.image),
                    url: normalizeLinkTarget(asText(l2?.url)),
                    children: l2Children.map((l3) => ({
                        id: resolveNodeId(l3?.id) || createNodeId('nav_l3'),
                        label: pickText(l3?.label, l3?.title),
                        icon: asText(l3?.icon),
                        iconUrl: pickText(l3?.iconUrl, l3?.imageUrl, l3?.image),
                        url: normalizeLinkTarget(asText(l3?.url)),
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

    const navItems = useMemo(
        () => toLegacyNavItems(config?.navigation?.items),
        [config?.navigation?.items]
    );

    const loading = status === 'loading' || status === 'saving';

    const fetchNavigation = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch (err) {
            return false;
        }
    }, [reload]);

    const saveNavItems = useCallback(async (newNavItems) => {
        try {
            const nextItems = toV1NavItems(newNavItems);
            updateConfig((prev) => ({
                ...prev,
                navigation: {
                    ...prev.navigation,
                    items: nextItems,
                },
            }));
            await saveNow();
            return true;
        } catch (err) {
            spLog.error('NavigationContext: failed to save navigation.', err);
            return false;
        }
    }, [saveNow, updateConfig]);

    const saveNavigation = useCallback((newNavItems) => saveNavItems(newNavItems), [saveNavItems]);

    const updateNavItem = useCallback(async (itemOrId, patch) => {
        const targetId = resolveNodeId(itemOrId);
        if (!targetId) return false;

        return saveNavItems(
            updateNodeById(navItems, targetId, (node) => ({
                ...node,
                ...normalizeNodePatch(node, patch),
            }))
        );
    }, [navItems, saveNavItems]);

    const updateSubItem = useCallback(async (parentOrId, childOrId, patch) => {
        const parentId = resolveNodeId(parentOrId);
        const childId = resolveNodeId(childOrId);
        if (!parentId || !childId) return false;

        return saveNavItems(
            updateNestedNode(navItems, parentId, childId, (node) => ({
                ...node,
                ...normalizeNodePatch(node, patch),
            }))
        );
    }, [navItems, saveNavItems]);

    const updateSubLink = useCallback(async (parentOrId, childOrId, linkOrId, patch) => {
        const parentId = resolveNodeId(parentOrId);
        const childId = resolveNodeId(childOrId);
        const linkId = resolveNodeId(linkOrId);
        if (!parentId || !childId || !linkId) return false;

        const nextItems = updateNodeById(navItems, parentId, (parent) => {
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
        });

        return saveNavItems(nextItems);
    }, [navItems, saveNavItems]);

    return (
        <NavigationContext.Provider
            value={{
                navItems,
                loading,
                error,
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
