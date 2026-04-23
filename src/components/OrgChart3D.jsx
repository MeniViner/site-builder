import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, darkTheme, GraphCanvas as Graph, Icon, lightTheme, Sphere } from 'reagraph';
import { resolveSiteImageUrl } from '../utils/assetUrl';

const DEFAULT_GRAPH_3D_SETTINGS = {
    initialExpandLevels: 1,
    linkDistance: 180,
    nodeStrength: -220,
    minDistance: 160,
    maxDistance: 12000,
    labelType: 'all',
    layoutType: 'forceDirected3d',
    cameraMode: 'rotate',
    edgeInterpolation: 'curved',
    edgeArrowPosition: 'end',
    edgeLabelPosition: 'natural',
    draggable: false,
    animated: true,
    aggregateEdges: false,
    defaultNodeSize: 9,
    minNodeSize: 6,
    maxNodeSize: 18,
    minZoom: 1,
    maxZoom: 100,
};
const GRAPH_3D_LABEL_TYPES = ['all', 'auto', 'none', 'nodes', 'edges'];
const GRAPH_3D_LAYOUT_TYPES = ['forceDirected3d', 'concentric3d', 'treeTd3d', 'treeLr3d', 'radialOut3d'];
const GRAPH_3D_CAMERA_MODES = ['pan', 'rotate', 'orbit', 'orthographic'];
const GRAPH_3D_EDGE_INTERPOLATIONS = ['linear', 'curved'];
const GRAPH_3D_EDGE_ARROW_POSITIONS = ['none', 'mid', 'end'];
const GRAPH_3D_EDGE_LABEL_POSITIONS = ['below', 'above', 'inline', 'natural'];
const FORCE_LIKE_3D_LAYOUTS = new Set(['forceDirected3d', 'treeTd3d', 'treeLr3d', 'radialOut3d']);

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function hexToRgba(hex, alpha) {
    const normalized = asText(hex).replace('#', '');
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    if (!normalized) return `rgba(8,145,178,${safeAlpha})`;

    const fullHex = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized;

    if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
        return asText(hex) || `rgba(8,145,178,${safeAlpha})`;
    }

    const r = Number.parseInt(fullHex.slice(0, 2), 16);
    const g = Number.parseInt(fullHex.slice(2, 4), 16);
    const b = Number.parseInt(fullHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function resolveCssVar(variableName, fallback) {
    if (typeof window === 'undefined') return fallback;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return value || fallback;
}

function withAlpha(color, alpha) {
    const source = asText(color);
    if (!source) return hexToRgba('#0891b2', alpha);
    if (source.startsWith('#')) return hexToRgba(source, alpha);
    return source;
}

function clampNumeric(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeGraph3dSettings(graph3dLike) {
    const source = isObject(graph3dLike) ? graph3dLike : {};
    const minDistance = clampNumeric(source.minDistance, 80, 4000, DEFAULT_GRAPH_3D_SETTINGS.minDistance);
    const maxDistanceCandidate = clampNumeric(source.maxDistance, 1200, 30000, DEFAULT_GRAPH_3D_SETTINGS.maxDistance);
    const labelType = GRAPH_3D_LABEL_TYPES.includes(source.labelType)
        ? source.labelType
        : DEFAULT_GRAPH_3D_SETTINGS.labelType;
    const layoutType = GRAPH_3D_LAYOUT_TYPES.includes(source.layoutType)
        ? source.layoutType
        : DEFAULT_GRAPH_3D_SETTINGS.layoutType;
    const cameraMode = GRAPH_3D_CAMERA_MODES.includes(source.cameraMode)
        ? source.cameraMode
        : DEFAULT_GRAPH_3D_SETTINGS.cameraMode;
    const edgeInterpolation = GRAPH_3D_EDGE_INTERPOLATIONS.includes(source.edgeInterpolation)
        ? source.edgeInterpolation
        : DEFAULT_GRAPH_3D_SETTINGS.edgeInterpolation;
    const edgeArrowPosition = GRAPH_3D_EDGE_ARROW_POSITIONS.includes(source.edgeArrowPosition)
        ? source.edgeArrowPosition
        : DEFAULT_GRAPH_3D_SETTINGS.edgeArrowPosition;
    const edgeLabelPosition = GRAPH_3D_EDGE_LABEL_POSITIONS.includes(source.edgeLabelPosition)
        ? source.edgeLabelPosition
        : DEFAULT_GRAPH_3D_SETTINGS.edgeLabelPosition;
    const minNodeSize = clampNumeric(source.minNodeSize, 2, 24, DEFAULT_GRAPH_3D_SETTINGS.minNodeSize);
    const maxNodeSizeCandidate = clampNumeric(source.maxNodeSize, 4, 48, DEFAULT_GRAPH_3D_SETTINGS.maxNodeSize);
    const minZoom = clampNumeric(source.minZoom, 1, 40, DEFAULT_GRAPH_3D_SETTINGS.minZoom);
    const maxZoomCandidate = clampNumeric(source.maxZoom, 4, 240, DEFAULT_GRAPH_3D_SETTINGS.maxZoom);

    return {
        initialExpandLevels: clampNumeric(source.initialExpandLevels, 1, 2, DEFAULT_GRAPH_3D_SETTINGS.initialExpandLevels),
        linkDistance: clampNumeric(source.linkDistance, 80, 420, DEFAULT_GRAPH_3D_SETTINGS.linkDistance),
        nodeStrength: clampNumeric(source.nodeStrength, -700, -40, DEFAULT_GRAPH_3D_SETTINGS.nodeStrength),
        minDistance,
        maxDistance: Math.max(maxDistanceCandidate, minDistance + 200),
        labelType,
        layoutType,
        cameraMode,
        edgeInterpolation,
        edgeArrowPosition,
        edgeLabelPosition,
        draggable: typeof source.draggable === 'boolean' ? source.draggable : DEFAULT_GRAPH_3D_SETTINGS.draggable,
        animated: typeof source.animated === 'boolean' ? source.animated : DEFAULT_GRAPH_3D_SETTINGS.animated,
        aggregateEdges: typeof source.aggregateEdges === 'boolean' ? source.aggregateEdges : DEFAULT_GRAPH_3D_SETTINGS.aggregateEdges,
        defaultNodeSize: clampNumeric(source.defaultNodeSize, 4, 28, DEFAULT_GRAPH_3D_SETTINGS.defaultNodeSize),
        minNodeSize,
        maxNodeSize: Math.max(maxNodeSizeCandidate, minNodeSize + 1),
        minZoom,
        maxZoom: Math.max(maxZoomCandidate, minZoom + 1),
    };
}

function withRtlMark(value) {
    const text = asText(value);
    return text ? `\u200F${text}` : text;
}

function buildSubLabel(node) {
    const rank = asText(node?.rank);
    const role = asText(node?.role);
    const composed = [rank, role].filter(Boolean).join(' | ');
    return composed || 'ללא דרגה ותפקיד';
}

function buildGraphData(rawNodes) {
    const nodes = [];
    const edges = [];
    const rootIds = [];
    const childrenById = new Map();
    const usedIds = new Set();

    const createUniqueId = (rawId, fallback) => {
        const base = asText(rawId) || fallback;
        if (!usedIds.has(base)) {
            usedIds.add(base);
            return base;
        }

        let suffix = 1;
        let candidate = `${base}-${suffix}`;
        while (usedIds.has(candidate)) {
            suffix += 1;
            candidate = `${base}-${suffix}`;
        }
        usedIds.add(candidate);
        return candidate;
    };

    const walk = (node, parentId, depth, index) => {
        if (!isObject(node)) return null;

        const fallbackId = parentId ? `${parentId}-${index + 1}` : `org-root-${index + 1}`;
        const id = createUniqueId(node.id, fallbackId);
        const children = Array.isArray(node.children) ? node.children : [];
        const label = asText(node.name) || asText(node.role) || 'צומת ללא שם';
        const icon = resolveSiteImageUrl(asText(node.imageUrl));

        nodes.push({
            id,
            label: withRtlMark(label),
            subLabel: withRtlMark(buildSubLabel(node)),
            icon,
            data: {
                ...node,
                id,
                parentId,
                depth,
                childrenCount: children.length,
            },
        });

        if (parentId) {
            edges.push({
                id: `${parentId}-${id}`,
                source: parentId,
                target: id,
            });
        } else {
            rootIds.push(id);
        }

        childrenById.set(id, []);
        children.forEach((child, childIndex) => {
            const childId = walk(child, id, depth + 1, childIndex);
            if (childId) childrenById.get(id).push(childId);
        });

        return id;
    };

    (Array.isArray(rawNodes) ? rawNodes : []).forEach((node, index) => {
        walk(node, null, 0, index);
    });

    return { nodes, edges, rootIds, childrenById };
}

function removeDescendantsFromExpansion(expanded, nodeId, childrenById) {
    const next = new Set(expanded);
    next.delete(nodeId);

    const stack = [nodeId];
    while (stack.length > 0) {
        const current = stack.pop();
        const children = childrenById.get(current) || [];
        children.forEach((childId) => {
            next.delete(childId);
            stack.push(childId);
        });
    }

    return next;
}

function buildInitialExpandedIds(rootIds, childrenById, initialExpandLevels) {
    const expanded = new Set(rootIds);
    let frontier = [...rootIds];

    for (let level = 1; level < initialExpandLevels; level += 1) {
        const nextFrontier = [];
        frontier.forEach((nodeId) => {
            const children = childrenById.get(nodeId) || [];
            children.forEach((childId) => {
                expanded.add(childId);
                nextFrontier.push(childId);
            });
        });
        frontier = nextFrontier;
        if (frontier.length === 0) break;
    }

    return Array.from(expanded);
}

function buildGraphTheme(primaryColor, effectiveMode) {
    const isDarkMode = effectiveMode === 'dark';
    const baseTheme = isDarkMode ? darkTheme : lightTheme;
    const accent = asText(primaryColor) || resolveCssVar('--color-primary-hex', '#0891b2');
    const bgBase = isDarkMode ? '#0c0d12' : '#eceff3';
    const bgElevated = isDarkMode ? '#252830' : '#ffffff';
    const textPrimary = isDarkMode ? '#f0f1f4' : '#111827';
    const textMuted = isDarkMode ? '#9ca3af' : '#6b7280';
    const labelStroke = isDarkMode ? withAlpha(bgBase, 0.9) : '#ffffff';
    const borderStrong = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';

    return {
        ...baseTheme,
        canvas: {
            ...baseTheme.canvas,
            background: bgBase,
        },
        node: {
            ...baseTheme.node,
            fill: bgElevated,
            activeFill: accent,
            label: {
                ...baseTheme.node.label,
                color: textPrimary,
                activeColor: textPrimary,
                stroke: labelStroke,
                strokeColor: withAlpha(accent, isDarkMode ? 0.3 : 0.18),
                strokeWidth: isDarkMode ? 1.25 : 0.9,
                backgroundOpacity: isDarkMode ? 0.08 : 0.04,
                backgroundColor: isDarkMode ? withAlpha(bgBase, 0.56) : withAlpha('#ffffff', 0.85),
            },
            subLabel: {
                ...baseTheme.node.subLabel,
                color: textMuted,
                activeColor: textPrimary,
                stroke: isDarkMode ? withAlpha(bgBase, 0.88) : withAlpha('#ffffff', 0.96),
            },
        },
        ring: {
            ...baseTheme.ring,
            fill: withAlpha(accent, 0.5),
            activeFill: accent,
        },
        edge: {
            ...baseTheme.edge,
            fill: withAlpha(accent, isDarkMode ? 0.35 : 0.5),
            activeFill: accent,
            label: {
                ...baseTheme.edge.label,
                color: textMuted,
                activeColor: textPrimary,
                stroke: labelStroke,
            },
            subLabel: {
                ...baseTheme.edge.subLabel,
                color: textMuted,
                activeColor: textPrimary,
                stroke: isDarkMode ? withAlpha(bgBase, 0.88) : withAlpha('#ffffff', 0.96),
            },
        },
        arrow: {
            ...baseTheme.arrow,
            fill: withAlpha(accent, isDarkMode ? 0.35 : 0.5),
            activeFill: accent,
        },
        lasso: {
            ...baseTheme.lasso,
            border: accent,
            background: withAlpha(accent, 0.18),
        },
        cluster: {
            ...baseTheme.cluster,
            stroke: borderStrong,
            fill: withAlpha(accent, 0.12),
            opacity: 0.26,
            label: {
                ...baseTheme.cluster?.label,
                color: textPrimary,
                stroke: labelStroke,
            },
        },
    };
}

export default function OrgChart3D({ rawNodes, graph3d, primaryColor, effectiveMode }) {
    const { nodes: flatNodes, edges: flatEdges, rootIds, childrenById } = useMemo(
        () => buildGraphData(rawNodes),
        [rawNodes]
    );
    const settings = useMemo(() => normalizeGraph3dSettings(graph3d), [graph3d]);
    const graphTheme = useMemo(() => buildGraphTheme(primaryColor, effectiveMode), [primaryColor, effectiveMode]);
    const isDarkMode = effectiveMode === 'dark';
    const badgeColors = useMemo(() => ({
        background: isDarkMode ? '#1f2937' : '#e5e7eb',
        text: isDarkMode ? '#ffffff' : '#111827',
        stroke: withAlpha(asText(primaryColor) || resolveCssVar('--color-primary-hex', '#0891b2'), 0.56),
    }), [isDarkMode, primaryColor]);
    const initialExpandedNodeIds = useMemo(
        () => buildInitialExpandedIds(rootIds, childrenById, settings.initialExpandLevels),
        [rootIds, childrenById, settings.initialExpandLevels]
    );
    const initialExpandedSignature = useMemo(
        () => JSON.stringify(initialExpandedNodeIds),
        [initialExpandedNodeIds]
    );

    const [expandedNodeIds, setExpandedNodeIds] = useState(() => initialExpandedNodeIds);

    useEffect(() => {
        setExpandedNodeIds(JSON.parse(initialExpandedSignature));
    }, [initialExpandedSignature]);

    const expandedSet = useMemo(() => new Set(expandedNodeIds), [expandedNodeIds]);

    const visibleNodeIdSet = useMemo(() => {
        const visibleIds = new Set();
        const queue = [...rootIds];

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (!nodeId || visibleIds.has(nodeId)) continue;

            visibleIds.add(nodeId);
            if (!expandedSet.has(nodeId)) continue;

            const children = childrenById.get(nodeId) || [];
            children.forEach((childId) => {
                if (!visibleIds.has(childId)) {
                    queue.push(childId);
                }
            });
        }

        return visibleIds;
    }, [rootIds, childrenById, expandedSet]);

    const visibleNodes = useMemo(
        () => flatNodes.filter((node) => visibleNodeIdSet.has(node.id)),
        [flatNodes, visibleNodeIdSet]
    );

    const visibleEdges = useMemo(
        () => flatEdges.filter((edge) => visibleNodeIdSet.has(edge.source) && visibleNodeIdSet.has(edge.target)),
        [flatEdges, visibleNodeIdSet]
    );
    const layoutOverrides = useMemo(
        () => (FORCE_LIKE_3D_LAYOUTS.has(settings.layoutType)
            ? {
                linkDistance: settings.linkDistance,
                nodeStrength: settings.nodeStrength,
                centerInertia: 0.8,
            }
            : undefined),
        [settings.layoutType, settings.linkDistance, settings.nodeStrength]
    );

    const handleNodeClick = useCallback((node) => {
        const nodeId = node?.id;
        if (!nodeId) return;

        setExpandedNodeIds((prev) => {
            const expanded = new Set(prev);
            if (expanded.has(nodeId)) {
                return Array.from(removeDescendantsFromExpansion(expanded, nodeId, childrenById));
            }

            expanded.add(nodeId);
            return Array.from(expanded);
        });
    }, [childrenById]);

    const renderNode = useCallback((props) => {
        const count = Number(props.node?.data?.childrenCount) || 0;
        const image = props.node?.icon || '';

        return (
            <>
                {image ? <Icon {...props} image={image} /> : <Sphere {...props} />}
                {count > 0 && (
                    <Badge
                        {...props}
                        label={String(count)}
                        position="top-right"
                        backgroundColor={badgeColors.background}
                        textColor={badgeColors.text}
                        strokeColor={badgeColors.stroke}
                        strokeWidth={0.9}
                        badgeSize={0.62}
                        padding={0.12}
                        fontWeight={800}
                    />
                )}
            </>
        );
    }, [badgeColors]);

    return (
        <div className="h-full w-full" dir="rtl">
            <Graph
                nodes={visibleNodes}
                edges={visibleEdges}
                layoutType={settings.layoutType}
                layoutOverrides={layoutOverrides}
                cameraMode={settings.cameraMode}
                minDistance={settings.minDistance}
                maxDistance={settings.maxDistance}
                minZoom={settings.minZoom}
                maxZoom={settings.maxZoom}
                labelType={settings.labelType}
                edgeInterpolation={settings.edgeInterpolation}
                edgeArrowPosition={settings.edgeArrowPosition}
                edgeLabelPosition={settings.edgeLabelPosition}
                draggable={settings.draggable}
                animated={settings.animated}
                aggregateEdges={settings.aggregateEdges}
                defaultNodeSize={settings.defaultNodeSize}
                minNodeSize={settings.minNodeSize}
                maxNodeSize={settings.maxNodeSize}
                renderNode={renderNode}
                onNodeClick={handleNodeClick}
                theme={graphTheme}
            />
        </div>
    );
}
