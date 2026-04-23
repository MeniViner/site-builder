/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { DEFAULT_CONFIG_V1 } from '../config/AppSchema';
import { useConfig } from './ConfigProvider';

const OrgChartContext = createContext(null);
const DEFAULT_ORG_CHART = DEFAULT_CONFIG_V1.content.orgChart;
const VALID_LAYOUT_DIRECTIONS = ['tree-center', 'step-rtl', 'step-ltr', '3d-graph', 'flow-canvas'];
const VALID_CARD_STYLES = ['classic', 'horizontal', 'large-avatar', 'compact'];
const VALID_LINE_STYLES = ['solid', 'dashed', 'dotted'];
const VALID_AVATAR_SHAPES = ['circle', 'rounded', 'square'];
const VALID_3D_LABEL_TYPES = ['all', 'auto', 'none', 'nodes', 'edges'];
const VALID_3D_LAYOUT_TYPES = ['forceDirected3d', 'concentric3d', 'treeTd3d', 'treeLr3d', 'radialOut3d'];
const VALID_3D_CAMERA_MODES = ['pan', 'rotate', 'orbit', 'orthographic'];
const VALID_3D_EDGE_INTERPOLATIONS = ['linear', 'curved'];
const VALID_3D_EDGE_ARROW_POSITIONS = ['none', 'mid', 'end'];
const VALID_3D_EDGE_LABEL_POSITIONS = ['below', 'above', 'inline', 'natural'];
const VALID_FLOW_EDGE_TYPES = ['default', 'straight', 'step', 'smoothstep', 'simplebezier'];
const VALID_FLOW_BACKGROUND_VARIANTS = ['dots', 'lines', 'cross'];
const VALID_FLOW_CONTROL_ORIENTATION = ['vertical', 'horizontal'];
const VALID_FLOW_VIEWPORT_MODES = ['map', 'design'];
const VALID_FLOW_NODE_VISUAL_STYLES = ['command', 'clean', 'minimal'];
const VALID_FLOW_AUTO_LAYOUT_DIRECTIONS = ['center', 'rtl', 'ltr'];

function clamp(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeNodePositions(nodePositionsLike) {
    const source = nodePositionsLike && typeof nodePositionsLike === 'object'
        ? nodePositionsLike
        : {};
    const normalized = {};

    Object.entries(source).forEach(([nodeId, coords]) => {
        const id = typeof nodeId === 'string' ? nodeId.trim() : '';
        if (!id || !coords || typeof coords !== 'object') return;

        const x = Number(coords.x);
        const y = Number(coords.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        normalized[id] = {
            x: Math.round(x),
            y: Math.round(y),
        };
    });

    return normalized;
}

function normalizeFlowCanvas(flowCanvasLike, fallback = DEFAULT_ORG_CHART.flowCanvas) {
    const source = flowCanvasLike && typeof flowCanvasLike === 'object' ? flowCanvasLike : {};
    const defaults = {
        ...DEFAULT_ORG_CHART.flowCanvas,
        ...(fallback && typeof fallback === 'object' ? fallback : {}),
    };

    return {
        edgeType: VALID_FLOW_EDGE_TYPES.includes(source.edgeType) ? source.edgeType : defaults.edgeType,
        edgeAnimated: typeof source.edgeAnimated === 'boolean' ? source.edgeAnimated : defaults.edgeAnimated,
        edgeOpacityPercent: clamp(source.edgeOpacityPercent, 20, 100, defaults.edgeOpacityPercent),
        edgeStrokeWidth: clamp(source.edgeStrokeWidth, 1, 6, defaults.edgeStrokeWidth),
        backgroundVariant: VALID_FLOW_BACKGROUND_VARIANTS.includes(source.backgroundVariant)
            ? source.backgroundVariant
            : defaults.backgroundVariant,
        backgroundGap: clamp(source.backgroundGap, 8, 120, defaults.backgroundGap),
        backgroundSize: clamp(source.backgroundSize, 1, 18, defaults.backgroundSize),
        showMiniMap: typeof source.showMiniMap === 'boolean' ? source.showMiniMap : defaults.showMiniMap,
        miniMapPannable: typeof source.miniMapPannable === 'boolean' ? source.miniMapPannable : defaults.miniMapPannable,
        miniMapZoomable: typeof source.miniMapZoomable === 'boolean' ? source.miniMapZoomable : defaults.miniMapZoomable,
        showControls: typeof source.showControls === 'boolean' ? source.showControls : defaults.showControls,
        showControlZoom: typeof source.showControlZoom === 'boolean' ? source.showControlZoom : defaults.showControlZoom,
        showControlFitView: typeof source.showControlFitView === 'boolean' ? source.showControlFitView : defaults.showControlFitView,
        showControlInteractive: typeof source.showControlInteractive === 'boolean'
            ? source.showControlInteractive
            : defaults.showControlInteractive,
        controlsOrientation: VALID_FLOW_CONTROL_ORIENTATION.includes(source.controlsOrientation)
            ? source.controlsOrientation
            : defaults.controlsOrientation,
        viewportMode: VALID_FLOW_VIEWPORT_MODES.includes(source.viewportMode)
            ? source.viewportMode
            : defaults.viewportMode,
        panOnScroll: typeof source.panOnScroll === 'boolean' ? source.panOnScroll : defaults.panOnScroll,
        zoomOnDoubleClick: typeof source.zoomOnDoubleClick === 'boolean'
            ? source.zoomOnDoubleClick
            : defaults.zoomOnDoubleClick,
        snapToGrid: typeof source.snapToGrid === 'boolean' ? source.snapToGrid : defaults.snapToGrid,
        snapGridX: clamp(source.snapGridX, 8, 160, defaults.snapGridX),
        snapGridY: clamp(source.snapGridY, 8, 160, defaults.snapGridY),
        fitViewPaddingPercent: clamp(source.fitViewPaddingPercent, 5, 80, defaults.fitViewPaddingPercent),
        onlyRenderVisibleElements: typeof source.onlyRenderVisibleElements === 'boolean'
            ? source.onlyRenderVisibleElements
            : defaults.onlyRenderVisibleElements,
        nodeVisualStyle: VALID_FLOW_NODE_VISUAL_STYLES.includes(source.nodeVisualStyle)
            ? source.nodeVisualStyle
            : defaults.nodeVisualStyle,
        hierarchySizing: typeof source.hierarchySizing === 'boolean'
            ? source.hierarchySizing
            : defaults.hierarchySizing,
        rootScalePercent: clamp(source.rootScalePercent, 100, 150, defaults.rootScalePercent),
        levelScaleStepPercent: clamp(source.levelScaleStepPercent, 0, 20, defaults.levelScaleStepPercent),
        minScalePercent: clamp(source.minScalePercent, 70, 100, defaults.minScalePercent),
        showRank: typeof source.showRank === 'boolean' ? source.showRank : defaults.showRank,
        showRole: typeof source.showRole === 'boolean' ? source.showRole : defaults.showRole,
        showAvatar: typeof source.showAvatar === 'boolean' ? source.showAvatar : defaults.showAvatar,
        autoLayoutDirection: VALID_FLOW_AUTO_LAYOUT_DIRECTIONS.includes(source.autoLayoutDirection)
            ? source.autoLayoutDirection
            : defaults.autoLayoutDirection,
    };
}

function normalizeOrgChartInput(orgChartLike, fallback = DEFAULT_ORG_CHART) {
    const source = orgChartLike && typeof orgChartLike === 'object' ? orgChartLike : {};
    const legacyLayoutDirectionMap = {
        'classic-tree': 'tree-center',
        'modern-cards': 'tree-center',
        'compact-list': 'step-rtl',
    };
    const legacyCardStyleMap = {
        'theme-solid': 'classic',
        'theme-outline': 'horizontal',
        'theme-glass': 'large-avatar',
        'classic-tree': 'classic',
        'modern-cards': 'horizontal',
        'compact-list': 'compact',
    };

    const layoutDirection = VALID_LAYOUT_DIRECTIONS.includes(source.layoutDirection)
        ? source.layoutDirection
        : (legacyLayoutDirectionMap[source.displayMode] || fallback.layoutDirection);
    const cardStyle = VALID_CARD_STYLES.includes(source.cardStyle)
        ? source.cardStyle
        : (legacyCardStyleMap[source.displayMode] || fallback.cardStyle);
    const lineStyle = VALID_LINE_STYLES.includes(source.lineStyle)
        ? source.lineStyle
        : fallback.lineStyle;
    const avatarShape = VALID_AVATAR_SHAPES.includes(source.avatarShape)
        ? source.avatarShape
        : fallback.avatarShape;
    const fallbackGraph3d = fallback?.graph3d || DEFAULT_ORG_CHART.graph3d;
    const sourceGraph3d = source?.graph3d && typeof source.graph3d === 'object' ? source.graph3d : {};
    const minDistance = clamp(sourceGraph3d.minDistance, 80, 4000, fallbackGraph3d.minDistance);
    const maxDistanceCandidate = clamp(sourceGraph3d.maxDistance, 1200, 30000, fallbackGraph3d.maxDistance);
    const minNodeSize = clamp(sourceGraph3d.minNodeSize, 2, 24, fallbackGraph3d.minNodeSize);
    const maxNodeSizeCandidate = clamp(sourceGraph3d.maxNodeSize, 4, 48, fallbackGraph3d.maxNodeSize);
    const minZoom = clamp(sourceGraph3d.minZoom, 1, 40, fallbackGraph3d.minZoom);
    const maxZoomCandidate = clamp(sourceGraph3d.maxZoom, 4, 240, fallbackGraph3d.maxZoom);
    const graph3d = {
        initialExpandLevels: clamp(sourceGraph3d.initialExpandLevels, 1, 2, fallbackGraph3d.initialExpandLevels),
        linkDistance: clamp(sourceGraph3d.linkDistance, 80, 420, fallbackGraph3d.linkDistance),
        nodeStrength: clamp(sourceGraph3d.nodeStrength, -700, -40, fallbackGraph3d.nodeStrength),
        minDistance,
        maxDistance: Math.max(maxDistanceCandidate, minDistance + 200),
        labelType: VALID_3D_LABEL_TYPES.includes(sourceGraph3d.labelType)
            ? sourceGraph3d.labelType
            : fallbackGraph3d.labelType,
        layoutType: VALID_3D_LAYOUT_TYPES.includes(sourceGraph3d.layoutType)
            ? sourceGraph3d.layoutType
            : fallbackGraph3d.layoutType,
        cameraMode: VALID_3D_CAMERA_MODES.includes(sourceGraph3d.cameraMode)
            ? sourceGraph3d.cameraMode
            : fallbackGraph3d.cameraMode,
        edgeInterpolation: VALID_3D_EDGE_INTERPOLATIONS.includes(sourceGraph3d.edgeInterpolation)
            ? sourceGraph3d.edgeInterpolation
            : fallbackGraph3d.edgeInterpolation,
        edgeArrowPosition: VALID_3D_EDGE_ARROW_POSITIONS.includes(sourceGraph3d.edgeArrowPosition)
            ? sourceGraph3d.edgeArrowPosition
            : fallbackGraph3d.edgeArrowPosition,
        edgeLabelPosition: VALID_3D_EDGE_LABEL_POSITIONS.includes(sourceGraph3d.edgeLabelPosition)
            ? sourceGraph3d.edgeLabelPosition
            : fallbackGraph3d.edgeLabelPosition,
        draggable: typeof sourceGraph3d.draggable === 'boolean'
            ? sourceGraph3d.draggable
            : fallbackGraph3d.draggable,
        animated: typeof sourceGraph3d.animated === 'boolean'
            ? sourceGraph3d.animated
            : fallbackGraph3d.animated,
        aggregateEdges: typeof sourceGraph3d.aggregateEdges === 'boolean'
            ? sourceGraph3d.aggregateEdges
            : fallbackGraph3d.aggregateEdges,
        defaultNodeSize: clamp(sourceGraph3d.defaultNodeSize, 4, 28, fallbackGraph3d.defaultNodeSize),
        minNodeSize,
        maxNodeSize: Math.max(maxNodeSizeCandidate, minNodeSize + 1),
        minZoom,
        maxZoom: Math.max(maxZoomCandidate, minZoom + 1),
    };

    return {
        ...fallback,
        ...source,
        layoutDirection,
        cardStyle,
        lineStyle,
        avatarShape,
        graph3d,
        flowCanvas: normalizeFlowCanvas(source.flowCanvas, fallback?.flowCanvas),
        nodePositions: normalizeNodePositions(source.nodePositions),
        nodes: Array.isArray(source.nodes) ? source.nodes : fallback.nodes,
    };
}

function resolveNextOrgChart(prevOrgChart, updater) {
    if (typeof updater === 'function') {
        return normalizeOrgChartInput(updater(prevOrgChart), prevOrgChart);
    }

    if (updater && typeof updater === 'object') {
        return normalizeOrgChartInput({ ...prevOrgChart, ...updater }, prevOrgChart);
    }

    return prevOrgChart;
}

export const OrgChartProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();

    const orgChart = useMemo(
        () => normalizeOrgChartInput(config?.content?.orgChart ?? DEFAULT_ORG_CHART),
        [config?.content?.orgChart]
    );

    const loading = status === 'loading' || status === 'saving';

    const updateOrgChart = useCallback((updater) => {
        updateConfig((prev) => {
            const prevOrgChart = normalizeOrgChartInput(prev?.content?.orgChart ?? DEFAULT_ORG_CHART);
            const nextOrgChart = resolveNextOrgChart(prevOrgChart, updater);

            return {
                ...prev,
                content: {
                    ...prev.content,
                    orgChart: nextOrgChart,
                },
            };
        });
    }, [updateConfig]);

    const saveOrgChart = useCallback(async (updater) => {
        try {
            if (updater !== undefined) {
                updateOrgChart(updater);
            }
            await saveNow();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }, [saveNow, updateOrgChart]);

    const fetchOrgChart = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }, [reload]);

    return (
        <OrgChartContext.Provider
            value={{
                orgChart,
                loading,
                error,
                updateOrgChart,
                saveOrgChart,
                fetchOrgChart,
            }}
        >
            {children}
        </OrgChartContext.Provider>
    );
};

export const useOrgChart = () => {
    const context = useContext(OrgChartContext);
    if (!context) {
        throw new Error('useOrgChart must be used within OrgChartProvider');
    }
    return context;
};

export { OrgChartContext };
