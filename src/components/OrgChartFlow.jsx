import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Position,
    useEdgesState,
    useNodesState,
} from 'reactflow';
import { resolveSiteImageUrl } from '../utils/assetUrl';
import 'reactflow/dist/style.css';

const FALLBACK_X_STEP = 320;
const FALLBACK_Y_STEP = 170;
const AUTO_LAYOUT_DIRECTIONS = ['center', 'rtl', 'ltr'];
const AUTO_LAYOUT_OPTIONS = [
    { id: 'center', label: 'מרכוז' },
    { id: 'rtl', label: 'ימין לשמאל' },
    { id: 'ltr', label: 'שמאל לימין' },
];
const AUTO_LAYOUT_SPACING = {
    centerX: 300,
    centerY: 220,
    horizontalX: 340,
    horizontalY: 190,
};
const DEFAULT_FLOW_SETTINGS = {
    edgeType: 'smoothstep',
    edgeAnimated: true,
    edgeOpacityPercent: 88,
    edgeStrokeWidth: 2,
    backgroundVariant: 'dots',
    backgroundGap: 18,
    backgroundSize: 1,
    showMiniMap: true,
    miniMapPannable: true,
    miniMapZoomable: false,
    showControls: true,
    showControlZoom: true,
    showControlFitView: true,
    showControlInteractive: false,
    controlsOrientation: 'vertical',
    viewportMode: 'map',
    panOnScroll: false,
    zoomOnDoubleClick: true,
    snapToGrid: false,
    snapGridX: 20,
    snapGridY: 20,
    fitViewPaddingPercent: 24,
    onlyRenderVisibleElements: false,
    nodeVisualStyle: 'command',
    hierarchySizing: true,
    rootScalePercent: 112,
    levelScaleStepPercent: 6,
    minScalePercent: 84,
    showRank: true,
    showRole: true,
    showAvatar: true,
    autoLayoutDirection: 'center',
};

function normalizeNodePositions(nodePositionsLike) {
    const source = nodePositionsLike && typeof nodePositionsLike === 'object' ? nodePositionsLike : {};
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

function avatarShapeClass(avatarShape) {
    if (avatarShape === 'rounded') return 'rounded-[18px]';
    if (avatarShape === 'square') return 'rounded-none';
    return 'rounded-full';
}

function buildTitle(node) {
    return node?.name?.trim() || node?.role?.trim() || 'צומת חדש';
}

function buildInitials(value) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 2) || 'צה';
}

function edgeStyleFromLineStyle(lineStyle, flowSettings) {
    const strokeWidth = Math.max(1, Number(flowSettings?.edgeStrokeWidth) || DEFAULT_FLOW_SETTINGS.edgeStrokeWidth);
    const strokeOpacity = Math.max(0.2, Math.min(1, (Number(flowSettings?.edgeOpacityPercent) || DEFAULT_FLOW_SETTINGS.edgeOpacityPercent) / 100));
    const primaryStroke = 'hsl(var(--color-primary) / 0.85)';

    if (lineStyle === 'dashed') {
        return { stroke: primaryStroke, strokeWidth, strokeDasharray: '8 7', strokeOpacity };
    }
    if (lineStyle === 'dotted') {
        return { stroke: primaryStroke, strokeWidth, strokeDasharray: '2 8', strokeOpacity };
    }
    return { stroke: primaryStroke, strokeWidth, strokeOpacity };
}

function normalizeFlowSettings(flowCanvasLike) {
    const source = flowCanvasLike && typeof flowCanvasLike === 'object' ? flowCanvasLike : {};
    const asBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
    const asEnum = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
    const asInt = (value, min, max, fallback) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, Math.round(parsed)));
    };

    return {
        edgeType: asEnum(source.edgeType, ['default', 'straight', 'step', 'smoothstep', 'simplebezier'], DEFAULT_FLOW_SETTINGS.edgeType),
        edgeAnimated: asBool(source.edgeAnimated, DEFAULT_FLOW_SETTINGS.edgeAnimated),
        edgeOpacityPercent: asInt(source.edgeOpacityPercent, 20, 100, DEFAULT_FLOW_SETTINGS.edgeOpacityPercent),
        edgeStrokeWidth: asInt(source.edgeStrokeWidth, 1, 6, DEFAULT_FLOW_SETTINGS.edgeStrokeWidth),
        backgroundVariant: asEnum(source.backgroundVariant, ['dots', 'lines', 'cross'], DEFAULT_FLOW_SETTINGS.backgroundVariant),
        backgroundGap: asInt(source.backgroundGap, 8, 120, DEFAULT_FLOW_SETTINGS.backgroundGap),
        backgroundSize: asInt(source.backgroundSize, 1, 18, DEFAULT_FLOW_SETTINGS.backgroundSize),
        showMiniMap: asBool(source.showMiniMap, DEFAULT_FLOW_SETTINGS.showMiniMap),
        miniMapPannable: asBool(source.miniMapPannable, DEFAULT_FLOW_SETTINGS.miniMapPannable),
        miniMapZoomable: asBool(source.miniMapZoomable, DEFAULT_FLOW_SETTINGS.miniMapZoomable),
        showControls: asBool(source.showControls, DEFAULT_FLOW_SETTINGS.showControls),
        showControlZoom: asBool(source.showControlZoom, DEFAULT_FLOW_SETTINGS.showControlZoom),
        showControlFitView: asBool(source.showControlFitView, DEFAULT_FLOW_SETTINGS.showControlFitView),
        showControlInteractive: asBool(source.showControlInteractive, DEFAULT_FLOW_SETTINGS.showControlInteractive),
        controlsOrientation: asEnum(source.controlsOrientation, ['vertical', 'horizontal'], DEFAULT_FLOW_SETTINGS.controlsOrientation),
        viewportMode: asEnum(source.viewportMode, ['map', 'design'], DEFAULT_FLOW_SETTINGS.viewportMode),
        panOnScroll: asBool(source.panOnScroll, DEFAULT_FLOW_SETTINGS.panOnScroll),
        zoomOnDoubleClick: asBool(source.zoomOnDoubleClick, DEFAULT_FLOW_SETTINGS.zoomOnDoubleClick),
        snapToGrid: asBool(source.snapToGrid, DEFAULT_FLOW_SETTINGS.snapToGrid),
        snapGridX: asInt(source.snapGridX, 8, 160, DEFAULT_FLOW_SETTINGS.snapGridX),
        snapGridY: asInt(source.snapGridY, 8, 160, DEFAULT_FLOW_SETTINGS.snapGridY),
        fitViewPaddingPercent: asInt(source.fitViewPaddingPercent, 5, 80, DEFAULT_FLOW_SETTINGS.fitViewPaddingPercent),
        onlyRenderVisibleElements: asBool(source.onlyRenderVisibleElements, DEFAULT_FLOW_SETTINGS.onlyRenderVisibleElements),
        nodeVisualStyle: asEnum(source.nodeVisualStyle, ['command', 'clean', 'minimal'], DEFAULT_FLOW_SETTINGS.nodeVisualStyle),
        hierarchySizing: asBool(source.hierarchySizing, DEFAULT_FLOW_SETTINGS.hierarchySizing),
        rootScalePercent: asInt(source.rootScalePercent, 100, 150, DEFAULT_FLOW_SETTINGS.rootScalePercent),
        levelScaleStepPercent: asInt(source.levelScaleStepPercent, 0, 20, DEFAULT_FLOW_SETTINGS.levelScaleStepPercent),
        minScalePercent: asInt(source.minScalePercent, 70, 100, DEFAULT_FLOW_SETTINGS.minScalePercent),
        showRank: asBool(source.showRank, DEFAULT_FLOW_SETTINGS.showRank),
        showRole: asBool(source.showRole, DEFAULT_FLOW_SETTINGS.showRole),
        showAvatar: asBool(source.showAvatar, DEFAULT_FLOW_SETTINGS.showAvatar),
        autoLayoutDirection: asEnum(source.autoLayoutDirection, AUTO_LAYOUT_DIRECTIONS, DEFAULT_FLOW_SETTINGS.autoLayoutDirection),
    };
}

function normalizeTreeWithResolvedIds(treeNodes) {
    let fallbackIndex = 0;

    function visit(node) {
        if (!node || typeof node !== 'object') return null;
        const id = typeof node.id === 'string' && node.id.trim()
            ? node.id.trim()
            : `org-node-${fallbackIndex + 1}`;
        fallbackIndex += 1;

        const children = (Array.isArray(node.children) ? node.children : [])
            .map((child) => visit(child))
            .filter(Boolean);

        return {
            ...node,
            id,
            children,
        };
    }

    return (Array.isArray(treeNodes) ? treeNodes : [])
        .map((node) => visit(node))
        .filter(Boolean);
}

function normalizeLayoutDirection(direction) {
    return AUTO_LAYOUT_DIRECTIONS.includes(direction) ? direction : 'center';
}

function buildCenteredTreePositions(treeNodes) {
    const positions = {};
    let leafCursor = 0;

    function visit(node, depth = 0) {
        const children = Array.isArray(node.children) ? node.children : [];

        let centerIndex = leafCursor + 0.5;
        if (children.length > 0) {
            const startLeaf = leafCursor;
            children.forEach((child) => visit(child, depth + 1));
            centerIndex = (startLeaf + leafCursor) / 2;
        } else {
            leafCursor += 1;
        }

        positions[node.id] = {
            x: Math.round(centerIndex * AUTO_LAYOUT_SPACING.centerX),
            y: Math.round(depth * AUTO_LAYOUT_SPACING.centerY),
        };
    }

    (Array.isArray(treeNodes) ? treeNodes : []).forEach((rootNode) => visit(rootNode, 0));
    const entries = Object.entries(positions);
    if (entries.length === 0) return positions;

    const xs = entries.map(([, position]) => position.x);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;

    return entries.reduce((acc, [nodeId, position]) => {
        acc[nodeId] = {
            x: Math.round(position.x - centerX),
            y: position.y,
        };
        return acc;
    }, {});
}

function buildHorizontalTreePositions(treeNodes, direction) {
    const positions = {};
    const isLtr = direction === 'ltr';
    let leafCursor = 0;

    function visit(node, depth = 0) {
        const children = Array.isArray(node.children) ? node.children : [];

        let centerIndex = leafCursor + 0.5;
        if (children.length > 0) {
            const startLeaf = leafCursor;
            children.forEach((child) => visit(child, depth + 1));
            centerIndex = (startLeaf + leafCursor) / 2;
        } else {
            leafCursor += 1;
        }

        positions[node.id] = {
            x: Math.round((isLtr ? 1 : -1) * depth * AUTO_LAYOUT_SPACING.horizontalX),
            y: Math.round(centerIndex * AUTO_LAYOUT_SPACING.horizontalY),
        };
    }

    (Array.isArray(treeNodes) ? treeNodes : []).forEach((rootNode) => visit(rootNode, 0));
    const entries = Object.entries(positions);
    if (entries.length === 0) return positions;

    const ys = entries.map(([, position]) => position.y);
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    return entries.reduce((acc, [nodeId, position]) => {
        acc[nodeId] = {
            x: position.x,
            y: Math.round(position.y - centerY),
        };
        return acc;
    }, {});
}

function buildHierarchyLayoutPositions(treeNodes, requestedDirection) {
    const direction = normalizeLayoutDirection(requestedDirection);
    if (direction === 'rtl' || direction === 'ltr') {
        return buildHorizontalTreePositions(treeNodes, direction);
    }
    return buildCenteredTreePositions(treeNodes);
}

function flattenOrgTree(treeNodes, nodePositions, lineStyle, avatarShape, flowSettings) {
    const nodes = [];
    const edges = [];
    const savedPositions = normalizeNodePositions(nodePositions);
    const edgeStyle = edgeStyleFromLineStyle(lineStyle, flowSettings);
    let fallbackIndex = 0;
    const autoLayoutDirection = normalizeLayoutDirection(flowSettings?.autoLayoutDirection);
    const autoLayoutPositions = buildHierarchyLayoutPositions(treeNodes, autoLayoutDirection);
    const sourcePosition = autoLayoutDirection === 'rtl'
        ? Position.Left
        : (autoLayoutDirection === 'ltr' ? Position.Right : Position.Bottom);
    const targetPosition = autoLayoutDirection === 'rtl'
        ? Position.Right
        : (autoLayoutDirection === 'ltr' ? Position.Left : Position.Top);

    function visit(node, parentId = null, depth = 0) {
        if (!node || typeof node !== 'object') return;

        const explicitId = node.id;
        const fallbackPosition = {
            x: depth * FALLBACK_X_STEP + fallbackIndex * 36,
            y: fallbackIndex * FALLBACK_Y_STEP + depth * 18,
        };
        const savedPosition = savedPositions[explicitId];
        const autoLayoutPosition = autoLayoutPositions[explicitId];
        const position = savedPosition
            ? { x: savedPosition.x, y: savedPosition.y }
            : (autoLayoutPosition ? { x: autoLayoutPosition.x, y: autoLayoutPosition.y } : fallbackPosition);

        nodes.push({
            id: explicitId,
            type: 'orgNode',
            position,
            sourcePosition,
            targetPosition,
            data: {
                name: node.name || '',
                rank: node.rank || '',
                role: node.role || '',
                imageUrl: node.imageUrl || '',
                avatarShape,
                depth,
                nodeVisualStyle: flowSettings.nodeVisualStyle,
                hierarchySizing: flowSettings.hierarchySizing,
                rootScalePercent: flowSettings.rootScalePercent,
                levelScaleStepPercent: flowSettings.levelScaleStepPercent,
                minScalePercent: flowSettings.minScalePercent,
                showRank: flowSettings.showRank,
                showRole: flowSettings.showRole,
                showAvatar: flowSettings.showAvatar,
            },
        });

        if (parentId) {
            edges.push({
                id: `edge-${parentId}-${explicitId}`,
                source: parentId,
                target: explicitId,
                type: flowSettings.edgeType,
                style: edgeStyle,
                animated: flowSettings.edgeAnimated,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 16,
                    height: 16,
                    color: 'hsl(var(--color-primary) / 0.88)',
                },
            });
        }

        fallbackIndex += 1;
        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach((child) => visit(child, explicitId, depth + 1));
    }

    (Array.isArray(treeNodes) ? treeNodes : []).forEach((rootNode) => visit(rootNode));

    return { nodes, edges };
}

function buildPositionsMapFromNodes(nodes) {
    return (Array.isArray(nodes) ? nodes : []).reduce((acc, node) => {
        if (!node?.id || !node?.position) return acc;
        acc[node.id] = {
            x: Math.round(Number(node.position.x) || 0),
            y: Math.round(Number(node.position.y) || 0),
        };
        return acc;
    }, {});
}

function OrgNode({ data }) {
    const title = buildTitle(data);
    const showRank = data?.showRank !== false;
    const showRole = data?.showRole !== false;
    const showAvatar = data?.showAvatar !== false;
    const subtitle = [
        showRank ? data?.rank : '',
        showRole ? data?.role : '',
    ].filter(Boolean).join(' | ');
    const avatarShape = avatarShapeClass(data?.avatarShape);
    const imageUrl = resolveSiteImageUrl(data?.imageUrl || '');
    const visualStyle = data?.nodeVisualStyle || 'command';
    const styleClass = visualStyle === 'clean'
        ? 'border border-primary/20 bg-white/95 shadow-[0_8px_20px_rgba(15,23,42,0.12)] dark:border-primary/30 dark:bg-[#182233]/95'
        : (visualStyle === 'minimal'
            ? 'border border-primary/10 bg-white/85 shadow-[0_6px_16px_rgba(15,23,42,0.1)] dark:border-primary/20 dark:bg-[#162032]/85'
            : 'border border-primary/30 bg-white/95 shadow-[0_14px_34px_rgba(15,23,42,0.18)] dark:border-primary/45 dark:bg-[#151f2f]/95');
    const handleClass = visualStyle === 'minimal'
        ? '!h-2.5 !w-2.5 !border !border-primary/45 !bg-white dark:!bg-[#0f1728]'
        : '!h-2.5 !w-2.5 !border !border-primary !bg-white dark:!bg-[#13243a]';
    const depth = Math.max(0, Number(data?.depth) || 0);
    const rootScalePercent = Math.max(100, Number(data?.rootScalePercent) || DEFAULT_FLOW_SETTINGS.rootScalePercent);
    const levelStepPercent = Math.max(0, Number(data?.levelScaleStepPercent) || DEFAULT_FLOW_SETTINGS.levelScaleStepPercent);
    const minScalePercent = Math.max(70, Number(data?.minScalePercent) || DEFAULT_FLOW_SETTINGS.minScalePercent);
    const levelFactor = Math.max(0, 1 - (levelStepPercent / 100));
    const computedScalePercent = rootScalePercent * Math.pow(levelFactor, depth);
    const scale = data?.hierarchySizing
        ? Math.max(minScalePercent, computedScalePercent) / 100
        : 1;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const cardWidthPx = Math.round(clamp(192, 292, 228 * scale));
    const paddingXPx = Math.round(clamp(10, 18, 14 * scale));
    const paddingYPx = Math.round(clamp(8, 16, 12 * scale));
    const avatarSizePx = Math.round(clamp(38, 70, 54 * scale));
    const titleSizePx = Math.round(clamp(12, 19, 14 * scale));
    const subtitleSizePx = Math.round(clamp(11, 14, 12 * scale));

    return (
        <article
            dir="rtl"
            className={`relative rounded-2xl text-right backdrop-blur-md ${styleClass}`}
            style={{
                width: `${cardWidthPx}px`,
                padding: `${paddingYPx}px ${paddingXPx}px`,
            }}
        >
            <Handle type="target" position={Position.Top} className={handleClass} />
            <div className={`flex ${showAvatar ? 'items-center gap-3' : 'items-start'} `}>
                {showAvatar && (
                    <div
                        className={`shrink-0 overflow-hidden border border-primary/35 bg-primary/10 ${avatarShape}`}
                        style={{
                            width: `${avatarSizePx}px`,
                            height: `${avatarSizePx}px`,
                        }}
                    >
                        {imageUrl ? (
                            <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-base font-black text-primary">
                                {buildInitials(title)}
                            </div>
                        )}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h3
                        className="truncate font-black text-gray-900 dark:text-white"
                        style={{
                            fontSize: `${titleSizePx}px`,
                            lineHeight: 1.25,
                        }}
                    >
                        {title}
                    </h3>
                    {subtitle && (
                        <p
                            className="mt-1 text-gray-600 dark:text-gray-300"
                            style={{
                                fontSize: `${subtitleSizePx}px`,
                                lineHeight: 1.35,
                            }}
                        >
                            {subtitle}
                        </p>
                    )}
                    {!subtitle && (showRank || showRole) && (
                        <p
                            className="mt-1 text-gray-500 dark:text-gray-400"
                            style={{
                                fontSize: `${subtitleSizePx}px`,
                                lineHeight: 1.35,
                            }}
                        >
                            ללא דרגה ותפקיד
                        </p>
                    )}
                    {!showRank && !showRole && (
                        <p
                            className="mt-1 text-gray-500 dark:text-gray-400"
                            style={{
                                fontSize: `${subtitleSizePx}px`,
                                lineHeight: 1.35,
                            }}
                        >
                            כרטיס מינימלי
                        </p>
                    )}
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className={handleClass} />
        </article>
    );
}

const nodeTypes = { orgNode: OrgNode };

export default function OrgChartFlow({
    config,
    isEditable = false,
    dragEnabled = true,
    onSavePositions,
    onFlowSettingChange,
    className = '',
}) {
    const chartNodes = useMemo(
        () => (Array.isArray(config?.nodes) ? config.nodes : []),
        [config?.nodes]
    );
    const normalizedTreeNodes = useMemo(
        () => normalizeTreeWithResolvedIds(chartNodes),
        [chartNodes]
    );
    const flowSettings = useMemo(
        () => normalizeFlowSettings(config?.flowCanvas),
        [config?.flowCanvas]
    );
    const normalizedPositions = useMemo(
        () => normalizeNodePositions(config?.nodePositions),
        [config?.nodePositions]
    );
    const flowElements = useMemo(
        () => flattenOrgTree(
            normalizedTreeNodes,
            normalizedPositions,
            config?.lineStyle || 'solid',
            config?.avatarShape || 'circle',
            flowSettings
        ),
        [normalizedTreeNodes, normalizedPositions, config?.lineStyle, config?.avatarShape, flowSettings]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(flowElements.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(flowElements.edges);
    const [draftPositions, setDraftPositions] = useState(() => buildPositionsMapFromNodes(flowElements.nodes));
    const [hasPendingChanges, setHasPendingChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [flowApi, setFlowApi] = useState(null);

    useEffect(() => {
        setEdges(flowElements.edges);
        setNodes((prevNodes) => {
            if (!hasPendingChanges) return flowElements.nodes;

            const previousPositions = new Map(
                (Array.isArray(prevNodes) ? prevNodes : []).map((node) => [node.id, node.position])
            );

            return flowElements.nodes.map((node) => {
                const previousPosition = previousPositions.get(node.id);
                return previousPosition
                    ? { ...node, position: previousPosition }
                    : node;
            });
        });

        if (!hasPendingChanges) {
            setDraftPositions(buildPositionsMapFromNodes(flowElements.nodes));
        }
    }, [flowElements, hasPendingChanges, setEdges, setNodes]);

    const handleNodeDragStop = useCallback((_, node) => {
        if (!isEditable || !dragEnabled) return;
        setDraftPositions((prev) => ({
            ...prev,
            [node.id]: {
                x: Math.round(node.position.x),
                y: Math.round(node.position.y),
            },
        }));
        setHasPendingChanges(true);
    }, [dragEnabled, isEditable]);

    const handleSavePositions = useCallback(async () => {
        if (!isEditable || typeof onSavePositions !== 'function' || isSaving) return;

        const nextPositions = Object.keys(draftPositions).length > 0
            ? draftPositions
            : buildPositionsMapFromNodes(nodes);
        setDraftPositions(nextPositions);
        setIsSaving(true);
        try {
            const result = await onSavePositions(nextPositions);
            if (result !== false) {
                setHasPendingChanges(false);
            }
        } finally {
            setIsSaving(false);
        }
    }, [draftPositions, isEditable, isSaving, nodes, onSavePositions]);

    const applyAutoLayout = useCallback((requestedDirection) => {
        if (!isEditable) return;
        const nextDirection = normalizeLayoutDirection(requestedDirection);
        const nextPositions = buildHierarchyLayoutPositions(normalizedTreeNodes, nextDirection);
        if (Object.keys(nextPositions).length === 0) return;

        setNodes((prevNodes) => prevNodes.map((node) => (
            nextPositions[node.id]
                ? { ...node, position: { ...nextPositions[node.id] } }
                : node
        )));
        setDraftPositions(nextPositions);
        setHasPendingChanges(true);

        if (typeof onFlowSettingChange === 'function') {
            onFlowSettingChange('autoLayoutDirection', nextDirection);
        }

        requestAnimationFrame(() => {
            flowApi?.fitView({
                padding: (flowSettings.fitViewPaddingPercent || DEFAULT_FLOW_SETTINGS.fitViewPaddingPercent) / 100,
                maxZoom: 1.2,
                duration: 320,
            });
        });
    }, [
        flowApi,
        flowSettings.fitViewPaddingPercent,
        isEditable,
        normalizedTreeNodes,
        onFlowSettingChange,
        setNodes,
    ]);

    const interactionPreset = flowSettings.viewportMode === 'design'
        ? { panOnDrag: false, selectionOnDrag: true, panOnScroll: true }
        : { panOnDrag: true, selectionOnDrag: false, panOnScroll: false };
    const activeAutoLayoutDirection = normalizeLayoutDirection(flowSettings.autoLayoutDirection);
    const controlsPosition = flowSettings.controlsOrientation === 'horizontal' ? 'bottom-center' : 'bottom-left';
    const canvasFrameClass = isEditable
        ? 'min-h-[540px] rounded-[30px] border border-primary/25 bg-primary/[0.06] shadow-[0_20px_48px_rgba(2,6,23,0.2)] dark:border-primary/35 dark:bg-[#0f1728]/92'
        : 'min-h-0 rounded-none border-0 bg-transparent shadow-none';
    const flowCanvasBackdropClass = isEditable
        ? 'bg-[radial-gradient(circle_at_top_left,hsl(var(--color-primary)/0.22),transparent_38%),radial-gradient(circle_at_bottom_right,hsl(var(--color-primary)/0.16),transparent_32%)]'
        : '';

    return (
        <div className={`relative h-full w-full overflow-hidden ${canvasFrameClass} ${className}`}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleNodeDragStop}
                fitView
                fitViewOptions={{ padding: (flowSettings.fitViewPaddingPercent || 24) / 100, maxZoom: 1.2 }}
                minZoom={0.2}
                maxZoom={2}
                nodesDraggable={isEditable && dragEnabled}
                nodesConnectable={false}
                elementsSelectable={isEditable}
                panOnDrag={interactionPreset.panOnDrag}
                selectionOnDrag={interactionPreset.selectionOnDrag && isEditable}
                panOnScroll={flowSettings.panOnScroll}
                zoomOnScroll
                zoomOnPinch
                zoomOnDoubleClick={flowSettings.zoomOnDoubleClick}
                snapToGrid={flowSettings.snapToGrid && isEditable}
                snapGrid={[flowSettings.snapGridX, flowSettings.snapGridY]}
                onlyRenderVisibleElements={flowSettings.onlyRenderVisibleElements}
                proOptions={{ hideAttribution: true }}
                onInit={setFlowApi}
                className={flowCanvasBackdropClass}
            >
                <Background
                    gap={flowSettings.backgroundGap}
                    size={flowSettings.backgroundSize}
                    color="hsl(var(--color-primary) / 0.28)"
                    variant={flowSettings.backgroundVariant === 'lines'
                        ? BackgroundVariant.Lines
                        : (flowSettings.backgroundVariant === 'cross'
                            ? BackgroundVariant.Cross
                            : BackgroundVariant.Dots)}
                />
                {flowSettings.showMiniMap && (
                    <MiniMap
                        pannable={flowSettings.miniMapPannable}
                        zoomable={flowSettings.miniMapZoomable}
                        className="!bg-white/80 dark:!bg-[#10172a]/90"
                    />
                )}
                {flowSettings.showControls && (
                    <Controls
                        position={controlsPosition}
                        showZoom={flowSettings.showControlZoom}
                        showFitView={flowSettings.showControlFitView}
                        showInteractive={flowSettings.showControlInteractive}
                        orientation={flowSettings.controlsOrientation}
                    />
                )}
            </ReactFlow>

            {isEditable && (
                <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex flex-wrap items-start justify-between gap-3">
                    <div className="pointer-events-auto inline-flex items-center gap-1 rounded-2xl border border-gray-200/90 bg-white/90 px-2 py-2 shadow-[0_12px_28px_rgba(2,6,23,0.2)] backdrop-blur-md dark:border-white/15 dark:bg-[#0f1728]/90">
                        {AUTO_LAYOUT_OPTIONS.map((option) => {
                            const isActive = activeAutoLayoutDirection === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => applyAutoLayout(option.id)}
                                    className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                                        isActive
                                            ? 'bg-primary text-white shadow-[0_8px_20px_rgba(8,145,178,0.35)]'
                                            : 'text-primary/80 hover:bg-primary/10 hover:text-primary dark:text-primary/70 dark:hover:bg-primary/15 dark:hover:text-primary'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={() => applyAutoLayout(DEFAULT_FLOW_SETTINGS.autoLayoutDirection)}
                        className="pointer-events-auto rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-black text-primary transition hover:bg-primary/15 dark:border-primary/45 dark:bg-primary/15 dark:text-primary"
                    >
                        איפוס למיקום ברירת מחדל
                    </button>

                    <button
                        type="button"
                        onClick={handleSavePositions}
                        disabled={!hasPendingChanges || isSaving}
                        className={`pointer-events-auto rounded-2xl px-4 py-2 text-sm font-black text-white transition ${
                            hasPendingChanges && !isSaving
                                ? 'bg-primary shadow-[0_10px_24px_rgba(8,145,178,0.35)] hover:brightness-110'
                                : 'cursor-not-allowed bg-primary/40'
                        }`}
                    >
                        {isSaving ? 'שומר...' : 'שמור מיקומים'}
                    </button>
                </div>
            )}

            {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
                    <div className="rounded-2xl border border-primary/25 bg-white/85 px-5 py-3 text-sm font-semibold text-primary shadow-sm dark:border-primary/35 dark:bg-black/35 dark:text-primary">
                        אין כרגע צמתים להצגה. הוסיפו צמתי צוות בטאב ניהול המבנה.
                    </div>
                </div>
            )}
        </div>
    );
}
