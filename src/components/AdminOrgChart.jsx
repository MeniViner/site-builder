import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    Download,
    Image as ImageIcon,
    LayoutGrid,
    Loader2,
    Monitor,
    Network,
    Pencil,
    Plus,
    Trash2,
    Upload,
    Users,
    X,
} from 'lucide-react';
import { useOrgChart } from '../context/OrgChartContext';
import { IDF_RANKS, IDF_ROLES } from '../data/idfDictionaries';
import { uploadImage } from '../utils/sharepointUtils';
import { resolveSiteImageUrl } from '../utils/assetUrl';
import { confirmToast } from '../utils/confirmToast';
import { spLog } from '../utils/spAppLog';
import Tooltip from './Tooltip';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';
import OrgChartFlow from './OrgChartFlow';
import OrgChartLivePreview from './OrgChartLivePreview';
import OrgChartMailLink from './OrgChartMailLink';
import { isValidPersonalNumber, personalNumberToArmyMailto } from '../utils/personalNumber';

const ROOT_NODE_ID = '__org_chart_root__';
const RANK_DATALIST_ID = 'org-chart-rank-options';
const ROLE_DATALIST_ID = 'org-chart-role-options';
const TABS = [
    { id: 'design-basic', label: 'הגדרות בסיס', description: 'כותרת העמוד והפעלה/כיבוי של הדף למשתמשים.' },
    { id: 'build', label: 'ניהול המבנה', description: 'בניית עץ הפיקוד, הוספת כפיפים ועריכת צמתים.' },
    { id: 'design-flow', label: 'קנבס', description: 'עריכת מיקומי הצמתים על קנבס הזרימה ושמירתם.' },
    // { id: 'design-layout', label: 'פריסה חלופית', description: 'פריסה, כרטיסים, קווים ואווטאר כחלופה לזרימה.' },
    // { id: 'design-3d', label: 'גרף תלת-מימדי', description: 'הפעלת גרף תלת-מימדי והגדרות אינטראקטיביות ייעודיות.' },
];
const LAYOUT_DIRECTION_OPTIONS = [
    {
        value: 'tree-center',
        label: 'עץ קלאסי',
        description: 'מלמעלה למטה, מהמרכז, עם הסתעפות היררכית מלאה.',
        kind: 'layout-tree-center',
    },
    {
        value: 'step-rtl',
        label: 'מדורג ימין לשמאל',
        description: 'שורש מימין והתקדמות מדורגת שמאלה עם חיבורי L ברורים.',
        kind: 'layout-step-rtl',
    },
    {
        value: 'step-ltr',
        label: 'מדורג שמאל לימין',
        description: 'שורש משמאל והתקדמות מדורגת ימינה, מתאים למבנים רוחביים.',
        kind: 'layout-step-ltr',
    },


];
const GRAPH_3D_LABEL_OPTIONS = [
    { value: 'all', label: 'הצג תמיד' },
    { value: 'auto', label: 'אוטומטי' },
    { value: 'none', label: 'ללא תוויות' },
    { value: 'nodes', label: 'צמתים בלבד' },
    { value: 'edges', label: 'קשרים בלבד' },
];
const GRAPH_3D_LAYOUT_OPTIONS = [
    { value: 'forceDirected3d', label: 'פיזור חופשי תלת-מימדי' },
    { value: 'treeTd3d', label: 'עץ עליון-תחתון תלת-מימדי' },
    { value: 'treeLr3d', label: 'עץ שמאל-ימין תלת-מימדי' },
    { value: 'radialOut3d', label: 'רדיאלי החוצה תלת-מימדי' },
    { value: 'concentric3d', label: 'טבעות תלת-מימדיות' },
];
const GRAPH_3D_CAMERA_OPTIONS = [
    { value: 'rotate', label: 'סיבוב' },
    { value: 'orbit', label: 'מסלול' },
    { value: 'pan', label: 'הזזה' },
    { value: 'orthographic', label: 'תצוגה ישרה' },
];
const GRAPH_3D_EDGE_INTERPOLATION_OPTIONS = [
    { value: 'curved', label: 'מעוגל' },
    { value: 'linear', label: 'ישר' },
];
const GRAPH_3D_EDGE_ARROW_OPTIONS = [
    { value: 'end', label: 'בסוף הקו' },
    { value: 'mid', label: 'באמצע הקו' },
    { value: 'none', label: 'ללא חץ' },
];
const GRAPH_3D_EDGE_LABEL_POSITION_OPTIONS = [
    { value: 'natural', label: 'טבעי' },
    { value: 'inline', label: 'בתוך הקו' },
    { value: 'below', label: 'מתחת לקו' },
    { value: 'above', label: 'מעל הקו' },
];
const CARD_STYLE_OPTIONS = [
    {
        value: 'classic',
        label: 'קלאסי',
        description: 'תמונה במרכז וטקסט מסודר מתחתיה, במבנה ייצוגי מאוזן.',
        kind: 'card-classic',
    },
    {
        value: 'horizontal',
        label: 'אופקי',
        description: 'תמונה בצד וטקסט לצידה, לקריאות מהירה ולכרטיס מעט רחב יותר.',
        kind: 'card-horizontal',
    },
    {
        value: 'large-avatar',
        label: 'אווטאר גדול',
        description: 'דגש חזק על הדמות עם תמונה גדולה וטקסט מינימלי.',
        kind: 'card-large-avatar',
    },
    {
        value: 'compact',
        label: 'קומפקטי',
        description: 'שורה קצרה ונקייה לצפיפות גבוהה יותר במבנים מורכבים.',
        kind: 'card-compact',
    },
];
const LINE_STYLE_OPTIONS = [
    {
        value: 'solid',
        label: 'קו מלא',
        description: 'חיבורים חדים, שקטים ורשמיים.',
        kind: 'line-solid',
    },
    {
        value: 'dashed',
        label: 'קו מקווקו',
        description: 'מראה טכני מעט יותר גמיש ודינמי.',
        kind: 'line-dashed',
    },
    {
        value: 'dotted',
        label: 'קו מנוקד',
        description: 'מראה קליל ומדויק עבור תרשימים צפופים.',
        kind: 'line-dotted',
    },
];
const AVATAR_SHAPE_OPTIONS = [
    {
        value: 'circle',
        label: 'עגול',
        kind: 'avatar-circle',
    },
    {
        value: 'rounded',
        label: 'מעוגל',
        kind: 'avatar-rounded',
    },
    {
        value: 'square',
        label: 'מרובע',
        kind: 'avatar-square',
    },
];
const FLOW_VISUAL_PRESET_OPTIONS = [
    {
        value: 'command',
        label: 'פיקודי מודגש',
    },
    {
        value: 'clean',
        label: 'נקי להצגה',
    },
    {
        value: 'minimal',
        label: 'מינימלי מהיר',
    },
];
const FLOW_AUTO_LAYOUT_OPTIONS = [
    { value: 'center', label: 'מרכוז', description: 'עץ קלאסי מלמעלה למטה עם מרכזיות היררכית מלאה.' },
    { value: 'rtl', label: 'ימין לשמאל', description: 'שורש מימין, וכל שכבה מתקדמת שמאלה לפי היררכיה.' },
    { value: 'ltr', label: 'שמאל לימין', description: 'שורש משמאל, וכל שכבה מתקדמת ימינה לפי היררכיה.' },
];
const DEFAULT_ORG_CHART = {
    enabled: false,
    pageTitle: 'עץ מבנה יחידתי',
    layoutDirection: 'flow-canvas',
    cardStyle: 'classic',
    lineStyle: 'solid',
    avatarShape: 'circle',
    graph3d: {
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
    },
    flowCanvas: {
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
        snapToGrid: true,
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
    },
    nodePositions: {},
    nodes: [],
};
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-gray-700/50 dark:bg-[#1e212b] dark:text-white';

function clampNumeric(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeGraph3dSettings(value, fallback = DEFAULT_ORG_CHART.graph3d) {
    const source = value && typeof value === 'object' ? value : {};
    const minDistance = clampNumeric(source.minDistance, 80, 4000, fallback.minDistance);
    const maxDistanceCandidate = clampNumeric(source.maxDistance, 1200, 30000, fallback.maxDistance);
    const labelType = GRAPH_3D_LABEL_OPTIONS.some((option) => option.value === source.labelType)
        ? source.labelType
        : fallback.labelType;
    const layoutType = GRAPH_3D_LAYOUT_OPTIONS.some((option) => option.value === source.layoutType)
        ? source.layoutType
        : fallback.layoutType;
    const cameraMode = GRAPH_3D_CAMERA_OPTIONS.some((option) => option.value === source.cameraMode)
        ? source.cameraMode
        : fallback.cameraMode;
    const edgeInterpolation = GRAPH_3D_EDGE_INTERPOLATION_OPTIONS.some((option) => option.value === source.edgeInterpolation)
        ? source.edgeInterpolation
        : fallback.edgeInterpolation;
    const edgeArrowPosition = GRAPH_3D_EDGE_ARROW_OPTIONS.some((option) => option.value === source.edgeArrowPosition)
        ? source.edgeArrowPosition
        : fallback.edgeArrowPosition;
    const edgeLabelPosition = GRAPH_3D_EDGE_LABEL_POSITION_OPTIONS.some((option) => option.value === source.edgeLabelPosition)
        ? source.edgeLabelPosition
        : fallback.edgeLabelPosition;
    const minNodeSize = clampNumeric(source.minNodeSize, 2, 24, fallback.minNodeSize);
    const maxNodeSizeCandidate = clampNumeric(source.maxNodeSize, 4, 48, fallback.maxNodeSize);
    const minZoom = clampNumeric(source.minZoom, 1, 40, fallback.minZoom);
    const maxZoomCandidate = clampNumeric(source.maxZoom, 4, 240, fallback.maxZoom);

    return {
        initialExpandLevels: clampNumeric(source.initialExpandLevels, 1, 2, fallback.initialExpandLevels),
        linkDistance: clampNumeric(source.linkDistance, 80, 420, fallback.linkDistance),
        nodeStrength: clampNumeric(source.nodeStrength, -700, -40, fallback.nodeStrength),
        minDistance,
        maxDistance: Math.max(maxDistanceCandidate, minDistance + 200),
        labelType,
        layoutType,
        cameraMode,
        edgeInterpolation,
        edgeArrowPosition,
        edgeLabelPosition,
        draggable: typeof source.draggable === 'boolean' ? source.draggable : fallback.draggable,
        animated: typeof source.animated === 'boolean' ? source.animated : fallback.animated,
        aggregateEdges: typeof source.aggregateEdges === 'boolean' ? source.aggregateEdges : fallback.aggregateEdges,
        defaultNodeSize: clampNumeric(source.defaultNodeSize, 4, 28, fallback.defaultNodeSize),
        minNodeSize,
        maxNodeSize: Math.max(maxNodeSizeCandidate, minNodeSize + 1),
        minZoom,
        maxZoom: Math.max(maxZoomCandidate, minZoom + 1),
    };
}

function normalizeFlowCanvasSettings(value, fallback = DEFAULT_ORG_CHART.flowCanvas) {
    const source = value && typeof value === 'object' ? value : {};
    const defaults = {
        ...DEFAULT_ORG_CHART.flowCanvas,
        ...(fallback && typeof fallback === 'object' ? fallback : {}),
    };

    const asBool = (candidate, fallbackValue) => (typeof candidate === 'boolean' ? candidate : fallbackValue);
    const asEnum = (candidate, allowed, fallbackValue) => (allowed.includes(candidate) ? candidate : fallbackValue);

    return {
        edgeType: asEnum(source.edgeType, ['default', 'straight', 'step', 'smoothstep', 'simplebezier'], defaults.edgeType),
        edgeAnimated: asBool(source.edgeAnimated, defaults.edgeAnimated),
        edgeOpacityPercent: clampNumeric(source.edgeOpacityPercent, 20, 100, defaults.edgeOpacityPercent),
        edgeStrokeWidth: clampNumeric(source.edgeStrokeWidth, 1, 6, defaults.edgeStrokeWidth),
        backgroundVariant: asEnum(source.backgroundVariant, ['dots', 'lines', 'cross'], defaults.backgroundVariant),
        backgroundGap: clampNumeric(source.backgroundGap, 8, 120, defaults.backgroundGap),
        backgroundSize: clampNumeric(source.backgroundSize, 1, 18, defaults.backgroundSize),
        showMiniMap: asBool(source.showMiniMap, defaults.showMiniMap),
        miniMapPannable: asBool(source.miniMapPannable, defaults.miniMapPannable),
        miniMapZoomable: asBool(source.miniMapZoomable, defaults.miniMapZoomable),
        showControls: asBool(source.showControls, defaults.showControls),
        showControlZoom: asBool(source.showControlZoom, defaults.showControlZoom),
        showControlFitView: asBool(source.showControlFitView, defaults.showControlFitView),
        showControlInteractive: asBool(source.showControlInteractive, defaults.showControlInteractive),
        controlsOrientation: asEnum(source.controlsOrientation, ['vertical', 'horizontal'], defaults.controlsOrientation),
        viewportMode: asEnum(source.viewportMode, ['map', 'design'], defaults.viewportMode),
        panOnScroll: asBool(source.panOnScroll, defaults.panOnScroll),
        zoomOnDoubleClick: asBool(source.zoomOnDoubleClick, defaults.zoomOnDoubleClick),
        snapToGrid: asBool(source.snapToGrid, defaults.snapToGrid),
        snapGridX: clampNumeric(source.snapGridX, 8, 160, defaults.snapGridX),
        snapGridY: clampNumeric(source.snapGridY, 8, 160, defaults.snapGridY),
        fitViewPaddingPercent: clampNumeric(source.fitViewPaddingPercent, 5, 80, defaults.fitViewPaddingPercent),
        onlyRenderVisibleElements: asBool(source.onlyRenderVisibleElements, defaults.onlyRenderVisibleElements),
        nodeVisualStyle: asEnum(source.nodeVisualStyle, ['command', 'clean', 'minimal'], defaults.nodeVisualStyle),
        hierarchySizing: asBool(source.hierarchySizing, defaults.hierarchySizing),
        rootScalePercent: clampNumeric(source.rootScalePercent, 100, 150, defaults.rootScalePercent),
        levelScaleStepPercent: clampNumeric(source.levelScaleStepPercent, 0, 20, defaults.levelScaleStepPercent),
        minScalePercent: clampNumeric(source.minScalePercent, 70, 100, defaults.minScalePercent),
        showRank: asBool(source.showRank, defaults.showRank),
        showRole: asBool(source.showRole, defaults.showRole),
        showAvatar: asBool(source.showAvatar, defaults.showAvatar),
        autoLayoutDirection: asEnum(source.autoLayoutDirection, ['center', 'rtl', 'ltr'], defaults.autoLayoutDirection),
    };
}

function createNodeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `org_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createNodeDraft() {
    return { id: createNodeId(), name: '', rank: '', role: '', personalNumber: '', imageUrl: '', children: [] };
}

function cloneNodes(nodes) {
    return (Array.isArray(nodes) ? nodes : []).map((node) => ({ ...node, children: cloneNodes(node.children) }));
}

function collectNodeIds(nodes, bucket = new Set()) {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        if (!node?.id) return;
        bucket.add(node.id);
        collectNodeIds(node.children, bucket);
    });
    return bucket;
}

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

function cloneOrgChart(orgChart) {
    const source = orgChart && typeof orgChart === 'object' ? orgChart : DEFAULT_ORG_CHART;
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

    return {
        enabled: source.enabled ?? DEFAULT_ORG_CHART.enabled,
        pageTitle: source.pageTitle ?? DEFAULT_ORG_CHART.pageTitle,
        layoutDirection: source.layoutDirection ?? legacyLayoutDirectionMap[source.displayMode] ?? DEFAULT_ORG_CHART.layoutDirection,
        cardStyle: source.cardStyle ?? legacyCardStyleMap[source.displayMode] ?? DEFAULT_ORG_CHART.cardStyle,
        lineStyle: source.lineStyle ?? DEFAULT_ORG_CHART.lineStyle,
        avatarShape: source.avatarShape ?? DEFAULT_ORG_CHART.avatarShape,
        graph3d: normalizeGraph3dSettings(source.graph3d, DEFAULT_ORG_CHART.graph3d),
        flowCanvas: normalizeFlowCanvasSettings(source.flowCanvas, DEFAULT_ORG_CHART.flowCanvas),
        nodePositions: normalizeNodePositions(source.nodePositions),
        nodes: cloneNodes(source.nodes),
    };
}

function normalizeImportedText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizePersonalNumberInput(value) {
    return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeImportedNodes(nodes, seenIds = new Set(), path = 'nodes') {
    if (!Array.isArray(nodes)) {
        throw new Error(`שדה ${path} חייב להיות מערך.`);
    }

    return nodes.map((node, index) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            throw new Error(`צומת מספר ${index + 1} בקובץ אינו תקין.`);
        }

        const importedId = normalizeImportedText(node.id);
        const id = importedId && !seenIds.has(importedId) ? importedId : createNodeId();
        seenIds.add(id);

        const children = node.children === undefined ? [] : normalizeImportedNodes(node.children, seenIds, `${path}.${index}.children`);

        return {
            id,
            name: normalizeImportedText(node.name ?? node.title ?? node.label, `צומת ${index + 1}`),
            rank: normalizeImportedText(node.rank),
            role: normalizeImportedText(node.role ?? node.position),
            personalNumber: normalizePersonalNumberInput(node.personalNumber ?? node.personalId ?? node.armyPersonalNumber),
            imageUrl: normalizeImportedText(node.imageUrl ?? node.image),
            children,
        };
    });
}

function validateImportedOrgChartPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('קובץ הייבוא חייב להכיל אובייקט JSON.');
    }

    const source = payload.orgChart || payload.structureTree || payload;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error('לא נמצא עץ מבנה תקין בקובץ.');
    }

    const nodes = normalizeImportedNodes(source.nodes);
    if (nodes.length === 0) {
        throw new Error('קובץ הייבוא לא מכיל צמתים לשחזור.');
    }

    return cloneOrgChart({
        ...source,
        nodes,
    });
}

function findNodeById(nodes, targetId) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (node.id === targetId) return node;
        const found = findNodeById(node.children, targetId);
        if (found) return found;
    }
    return null;
}

function updateNodeById(nodes, targetId, updater) {
    return (Array.isArray(nodes) ? nodes : []).map((node) => (
        node.id === targetId
            ? updater({ ...node, children: cloneNodes(node.children) })
            : { ...node, children: updateNodeById(node.children, targetId, updater) }
    ));
}

function removeNodeById(nodes, targetId) {
    return (Array.isArray(nodes) ? nodes : [])
        .filter((node) => node.id !== targetId)
        .map((node) => ({ ...node, children: removeNodeById(node.children, targetId) }));
}

function countNodes(nodes) {
    return (Array.isArray(nodes) ? nodes : []).reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

function getDepth(nodes, level = 1) {
    if (!Array.isArray(nodes) || nodes.length === 0) return level - 1;
    return nodes.reduce((max, node) => Math.max(max, getDepth(node.children, level + 1)), level);
}

function displayName(node) {
    return node?.name?.trim() || node?.role?.trim() || 'צומת חדש';
}

function subtitle(node) {
    return [node?.rank, node?.role].filter(Boolean).join(' | ') || 'ללא דרגה ותפקיד';
}

function avatarRadiusClass(avatarShape) {
    if (avatarShape === 'rounded') return 'rounded-[24px]';
    if (avatarShape === 'square') return 'rounded-none';
    return 'rounded-full';
}

function NodeAvatar({ node, avatarShape, size = 'sm' }) {
    const src = resolveSiteImageUrl(node.imageUrl);
    const sizeClasses = size === 'sm' ? 'h-10 w-10 text-xs' : 'h-20 w-20 text-xl';
    const initials = displayName(node).replace(/\s+/g, ' ').trim().slice(0, 2) || 'צה';

    return (
        <div className={`${sizeClasses} ${avatarRadiusClass(avatarShape)} overflow-hidden border border-primary/25 bg-primary/10 shadow-[0_10px_24px_rgba(0,0,0,0.16)]`}>
            {node.imageUrl ? (
                <img src={src} alt={displayName(node)} className="h-full w-full object-cover" />
            ) : (
                <div className="flex h-full w-full items-center justify-center font-black text-primary">{initials}</div>
            )}
        </div>
    );
}

function SettingCard({ title, description, children, helpTitle, helpDescription }) {
    return (
        <section className="rounded-[28px] border border-gray-200 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-white/10">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2>
                        {helpTitle && <HelpTooltipButton title={helpTitle} description={helpDescription} />}
                    </div>
                    {description && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>}
                </div>
            </div>
            {children}
        </section>
    );
}

function OptionVisual({ kind, active }) {
    const activeLine = active ? 'border-primary' : 'border-gray-400 dark:border-gray-500';
    const activeFill = active ? 'bg-primary/15' : 'bg-gray-100 dark:bg-white/5';
    const activeDot = active ? 'bg-primary' : 'bg-gray-400 dark:bg-gray-500';

    if (kind === 'layout-tree-center') {
        return (
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl ${activeFill}`}>
                <span className={`absolute top-[11px] h-2 w-2 rounded-full ${activeDot}`} />
                <span className={`absolute top-[19px] h-3 border-r-2 ${activeLine}`} />
                <span className={`absolute top-[31px] w-7 border-t-2 ${activeLine}`} />
                <span className={`absolute bottom-[8px] left-[11px] h-2 w-2 rounded-full ${activeDot}`} />
                <span className={`absolute bottom-[8px] right-[11px] h-2 w-2 rounded-full ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'layout-step-rtl') {
        return (
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl ${activeFill}`}>
                <span className={`absolute right-[11px] top-[8px] h-8 border-r-2 ${activeLine}`} />
                <span className={`absolute right-[11px] top-[13px] w-4 border-t-2 ${activeLine}`} />
                <span className={`absolute right-[11px] top-[27px] w-4 border-t-2 ${activeLine}`} />
                <span className={`absolute left-[8px] top-[11px] h-2 w-2 rounded-full ${activeDot}`} />
                <span className={`absolute left-[8px] top-[25px] h-2 w-2 rounded-full ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'layout-step-ltr') {
        return (
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl ${activeFill}`}>
                <span className={`absolute left-[11px] top-[8px] h-8 border-l-2 ${activeLine}`} />
                <span className={`absolute left-[11px] top-[13px] w-4 border-t-2 ${activeLine}`} />
                <span className={`absolute left-[11px] top-[27px] w-4 border-t-2 ${activeLine}`} />
                <span className={`absolute right-[8px] top-[11px] h-2 w-2 rounded-full ${activeDot}`} />
                <span className={`absolute right-[8px] top-[25px] h-2 w-2 rounded-full ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'layout-flow-canvas') {
        return (
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`absolute left-[8px] top-[9px] h-2.5 w-2.5 rounded-full ${activeDot}`} />
                <span className={`absolute right-[8px] top-[10px] h-2.5 w-2.5 rounded-full ${activeDot}`} />
                <span className={`absolute bottom-[8px] left-[20px] h-2.5 w-2.5 rounded-full ${activeDot}`} />
                <span className={`absolute top-[14px] left-[13px] w-[15px] border-t-2 ${activeLine}`} />
                <span className={`absolute left-[13px] top-[15px] h-[11px] border-l-2 ${activeLine}`} />
                <span className={`absolute right-[13px] top-[15px] h-[11px] border-r-2 ${activeLine}`} />
                <span className={`absolute bottom-[13px] left-[22px] w-[10px] border-t-2 ${activeLine}`} />
            </div>
        );
    }

    if (kind === 'layout-3d-graph') {
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <Network size={22} className={active ? 'text-primary' : 'text-gray-500'} />
            </div>
        );
    }

    if (kind === 'card-classic') {
        return (
            <div className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`mb-1 h-4 w-4 rounded-full ${activeDot}`} />
                <span className={`mb-1 h-[3px] w-6 rounded-full ${activeDot}`} />
                <span className={`h-[2px] w-5 rounded-full ${activeDot} opacity-65`} />
            </div>
        );
    }

    if (kind === 'card-horizontal') {
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`ml-2 h-4 w-4 rounded-full ${activeDot}`} />
                <div className="space-y-1">
                    <span className={`block h-[3px] w-5 rounded-full ${activeDot}`} />
                    <span className={`block h-[2px] w-4 rounded-full ${activeDot} opacity-65`} />
                </div>
            </div>
        );
    }

    if (kind === 'card-large-avatar') {
        return (
            <div className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`mb-1 h-6 w-6 rounded-[10px] ${activeDot}`} />
                <span className={`h-[3px] w-4 rounded-full ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'card-compact') {
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`ml-1.5 h-3 w-3 rounded-full ${activeDot}`} />
                <span className={`h-[3px] w-6 rounded-full ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'line-solid' || kind === 'line-dashed' || kind === 'line-dotted') {
        const lineStyle = kind.replace('line-', '');
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <div className="w-7 border-t-[3px]" style={{ borderTopStyle: lineStyle, borderTopColor: 'currentColor' }} />
            </div>
        );
    }

    if (kind === 'avatar-circle') {
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`h-7 w-7 rounded-full ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'avatar-rounded') {
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`h-7 w-7 rounded-[10px] ${activeDot}`} />
            </div>
        );
    }

    if (kind === 'avatar-square') {
        return (
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
                <span className={`h-7 w-7 rounded-none ${activeDot}`} />
            </div>
        );
    }

    return (
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${activeLine} ${activeFill}`}>
            <LayoutGrid size={20} className={active ? 'text-primary' : 'text-gray-500'} />
        </div>
    );
}

function OptionCard({ option, isActive, onSelect }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`relative flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-right transition-all ${
                isActive
                    ? 'border-primary/45 bg-primary/10 shadow-[0_10px_24px_rgba(8,145,178,0.14)]'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-white/10 dark:bg-[#1b1f2a] dark:hover:border-white/20'
            }`}
        >
            <div className="shrink-0">
                <OptionVisual kind={option.kind} active={isActive} />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className={`text-sm font-black ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'}`}>{option.label}</h3>
                <p className={`mt-1 text-xs leading-6 ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>{option.description}</p>
            </div>
            <div className="shrink-0">
                {isActive ? <CheckCircle2 size={18} className="text-primary" /> : <div className="mt-1 h-4 w-4 rounded-full border border-gray-300 dark:border-white/15" />}
            </div>
        </button>
    );
}

function PreviewMonitor({ draft, activeTab, onSaveFlowPositions, onFlowSettingChange }) {
    const isFlowTab = activeTab === 'design-flow';
    const isFlowLayout = draft.layoutDirection === 'flow-canvas';
    const [previewPaneTab, setPreviewPaneTab] = useState('preview');
    const [isManualDragEnabled, setIsManualDragEnabled] = useState(true);
    const effectivePreviewPaneTab = isFlowTab ? previewPaneTab : 'preview';
    const isManualPositionTabActive = effectivePreviewPaneTab === 'manual-position';
    const showFlowRuntimePreview = isFlowTab && isFlowLayout && !isManualPositionTabActive;

    return (
        <div className={`sticky top-[128px] ${isFlowTab ? 'max-h-[calc(100vh-145px)] overflow-y-auto custom-scrollbar pr-1' : ''}`}>
            {/* <div className="mb-3 flex items-center justify-between px-1" dir="rtl">
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">תצוגה מקדימה</p>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">חי</span>
            </div> */}

            {isFlowTab && (
                <div className="mb-4 rounded-2xl border border-gray-200 bg-white/80 p-1.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex flex-wrap gap-2 items-center">
                        <Monitor size={20} className="text-primary dark:text-primary-600" />
                        <button
                            type="button"
                            onClick={() => setPreviewPaneTab('preview')}
                            className={`rounded-lg border px-3 py-0.5 text-xs font-bold transition ${
                                previewPaneTab === 'preview'
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1b1f2a] text-gray-500 dark:text-gray-300 hover:border-primary/40 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            תצוגה מקדימה
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreviewPaneTab('manual-position')}
                            className={`rounded-lg border px-3 py-0.5 text-xs font-bold transition ${
                                previewPaneTab === 'manual-position'
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1b1f2a] text-gray-500 dark:text-gray-300 hover:border-primary/40 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            עריכת מיקום ידנית
                        </button>
                    </div>
                </div>
            )}

            {showFlowRuntimePreview && (
                <div className="h-[420px] min-h-[360px] rounded-[28px] border border-gray-200 bg-white/90 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <OrgChartFlow config={draft} isEditable={false} />
                </div>
            )}

            {!isManualPositionTabActive && !showFlowRuntimePreview && (
                <div className="flex flex-col items-center gap-2">
                    <div className="w-full bg-transparent flex justify-center">
                        <div className="border-[6px] lg:border-[8px] border-[#1e212b] rounded-2xl md:rounded-3xl bg-[#1e212b] shadow-2xl relative z-10 overflow-hidden w-full">
                            <OrgChartLivePreview draft={draft} />
                        </div>
                    </div>

                    <div className="flex flex-col items-center relative z-0 -mt-1">
                        <div className="w-16 md:w-20 h-8 md:h-12 bg-gradient-to-b from-[#1e212b] to-gray-600 shadow-inner" />
                        <div className="w-40 md:w-56 h-4 md:h-6 bg-gradient-to-b from-gray-500 to-gray-800 rounded-t-xl md:rounded-t-2xl shadow-2xl border-b-4 border-gray-900 relative">
                            <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-white/20" />
                        </div>
                        <div className="w-48 md:w-64 h-2 bg-black/20 blur-md rounded-full mt-1" />
                    </div>
                </div>
            )}

            {isManualPositionTabActive && (
                <div className="mt-5 rounded-[28px]   p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-3 flex items-center justify-between gap-3 px-1" dir="rtl">
                        <div>
                            <p className="text-sm font-black text-gray-900 dark:text-white">עריכת מיקום ידנית</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">כאן גוררים, מיישרים ושומרים מיקומים בצורה ידנית.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsManualDragEnabled((prev) => !prev)}
                                disabled={!isFlowLayout}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                                    !isFlowLayout
                                        ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-500'
                                        : isManualDragEnabled
                                            ? 'bg-primary/20 text-primary hover:bg-primary/30 dark:text-primary'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15'
                                }`}
                            >
                                {isManualDragEnabled ? 'כיבוי גרירה' : 'הפעלת גרירה'}
                            </button>
                            {/* <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                                isFlowLayout
                                    ? 'border-primary/40 bg-primary/10 text-primary dark:text-primary'
                                    : 'border-gray-300/70 bg-white/70 text-gray-500 dark:border-white/15 dark:bg-white/10 dark:text-gray-300'
                            }`}>
                                {isFlowLayout ? (isManualDragEnabled ? 'גרירה פעילה' : 'גרירה כבויה') : 'נעול'}
                            </span> */}
                        </div>
                    </div>

                    <div className="h-[360px] min-h-[320px] md:h-[420px]">
                        <OrgChartFlow
                            config={draft}
                            isEditable={isFlowLayout}
                            dragEnabled={isManualDragEnabled}
                            onSavePositions={onSaveFlowPositions}
                            onFlowSettingChange={onFlowSettingChange}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminOrgChart() {
    useEffect(() => {
        spLog.info('Premium AdminOrgChart Loaded');
    }, []);

    const { orgChart, loading, error, saveOrgChart } = useOrgChart();
    const [draft, setDraft] = useState(() => cloneOrgChart(orgChart));
    const [activeTab, setActiveTab] = useState('design-flow');
    const [expandedIds, setExpandedIds] = useState(() => new Set([ROOT_NODE_ID]));
    const [activeNodeId, setActiveNodeId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [importError, setImportError] = useState('');
    const [modalState, setModalState] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef(null);
    const structureImportInputRef = useRef(null);
    const lastSavedRef = useRef(null);
    const latestDraftRef = useRef(draft);
    const latestOrgChartRef = useRef(orgChart);

    useEffect(() => {
        const nextDraft = cloneOrgChart(orgChart);
        setDraft(nextDraft);
        lastSavedRef.current = JSON.stringify(nextDraft);
        setExpandedIds((prev) => {
            const validIds = collectNodeIds(nextDraft.nodes);
            const next = new Set([ROOT_NODE_ID]);
            prev.forEach((id) => {
                if (id === ROOT_NODE_ID || validIds.has(id)) {
                    next.add(id);
                }
            });
            next.add(ROOT_NODE_ID);
            return next;
        });
        setActiveNodeId((prev) => (prev && findNodeById(nextDraft.nodes, prev) ? prev : null));
    }, [orgChart]);

    useEffect(() => {
        latestDraftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        latestOrgChartRef.current = orgChart;
    }, [orgChart]);

    useEffect(() => {
        const current = JSON.stringify(draft);
        if (lastSavedRef.current === null || current === lastSavedRef.current) return undefined;

        const timeoutId = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveOrgChart(draft);
            setIsSaving(false);
            if (success) {
                lastSavedRef.current = current;
                return;
            }
            setSaveMessage({ type: 'error', text: 'שמירת עץ המבנה נכשלה. ניתן להמשיך לערוך ולנסות שוב.' });
        }, 900);

        return () => clearTimeout(timeoutId);
    }, [draft, saveOrgChart]);

    useEffect(() => () => {
        const pendingDraft = latestDraftRef.current;
        const latestOrgChart = latestOrgChartRef.current;
        if (!pendingDraft || !latestOrgChart) return;

        const pendingSnapshot = JSON.stringify(pendingDraft);
        const savedSnapshot = JSON.stringify(cloneOrgChart(latestOrgChart));
        if (pendingSnapshot !== savedSnapshot) {
            saveOrgChart(pendingDraft);
        }
    }, [saveOrgChart]);

    const totalNodes = useMemo(() => countNodes(draft.nodes), [draft.nodes]);
    const depth = useMemo(() => getDepth(draft.nodes), [draft.nodes]);

    const handleExportStructureTree = useCallback(() => {
        const payload = {
            type: 'siteBuilder-org-chart',
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            orgChart: cloneOrgChart(latestDraftRef.current),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        anchor.href = url;
        anchor.download = `structure-tree-${dateStamp}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, []);

    const applyImportedStructureTree = useCallback((nextDraft) => {
        setDraft(nextDraft);
        setActiveTab('build');
        setActiveNodeId(nextDraft.nodes[0]?.id || null);
        setExpandedIds(new Set([ROOT_NODE_ID, ...nextDraft.nodes.map((node) => node.id)]));
        setImportError('');
        setSaveMessage({ type: 'success', text: 'עץ המבנה יובא בהצלחה ונשמר אוטומטית.' });
    }, []);

    const handleImportStructureTree = useCallback(async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const nextDraft = validateImportedOrgChartPayload(parsed);
            const confirmed = await confirmToast({
                title: 'ייבוא עץ מבנה',
                message: 'הייבוא יחליף את עץ המבנה הנוכחי לאחר בדיקת תקינות הקובץ. להמשיך?',
                confirmText: 'ייבא',
                cancelText: 'ביטול',
                type: 'warning',
            });
            if (!confirmed) return;
            applyImportedStructureTree(nextDraft);
        } catch (err) {
            const message = err?.message || 'קובץ עץ המבנה אינו תקין.';
            setImportError(message);
            setSaveMessage({ type: 'error', text: `ייבוא עץ המבנה נכשל: ${message}` });
        }
    }, [applyImportedStructureTree]);

    const updateDraftField = useCallback((field, value) => {
        setDraft((prev) => ({ ...prev, [field]: value }));
    }, []);

    const updateGraph3dField = useCallback((field, value) => {
        setDraft((prev) => ({
            ...prev,
            graph3d: normalizeGraph3dSettings(
                {
                    ...(prev.graph3d || DEFAULT_ORG_CHART.graph3d),
                    [field]: value,
                },
                DEFAULT_ORG_CHART.graph3d
            ),
        }));
    }, []);

    const updateFlowCanvasField = useCallback((field, value) => {
        setDraft((prev) => ({
            ...prev,
            flowCanvas: normalizeFlowCanvasSettings(
                {
                    ...(prev.flowCanvas || DEFAULT_ORG_CHART.flowCanvas),
                    [field]: value,
                },
                DEFAULT_ORG_CHART.flowCanvas
            ),
        }));
    }, []);

    const applyFlowVisualPreset = useCallback((preset) => {
        const PRESET_MAP = {
            command: {
                nodeVisualStyle: 'command',
                hierarchySizing: true,
                rootScalePercent: 112,
                levelScaleStepPercent: 6,
                minScalePercent: 84,
                showAvatar: true,
                showRank: true,
                showRole: true,
                edgeAnimated: false,
                edgeStrokeWidth: 2,
                edgeOpacityPercent: 88,
            },
            clean: {
                nodeVisualStyle: 'clean',
                hierarchySizing: true,
                rootScalePercent: 108,
                levelScaleStepPercent: 4,
                minScalePercent: 86,
                showAvatar: true,
                showRank: true,
                showRole: true,
                edgeAnimated: false,
                edgeStrokeWidth: 2,
                edgeOpacityPercent: 82,
            },
            minimal: {
                nodeVisualStyle: 'minimal',
                hierarchySizing: false,
                rootScalePercent: 104,
                levelScaleStepPercent: 2,
                minScalePercent: 90,
                showAvatar: false,
                showRank: false,
                showRole: true,
                edgeAnimated: true,
                edgeStrokeWidth: 1,
                edgeOpacityPercent: 72,
            },
        };

        const patch = PRESET_MAP[preset];
        if (!patch) return;

        setDraft((prev) => ({
            ...prev,
            flowCanvas: normalizeFlowCanvasSettings(
                {
                    ...(prev.flowCanvas || DEFAULT_ORG_CHART.flowCanvas),
                    ...patch,
                },
                DEFAULT_ORG_CHART.flowCanvas
            ),
        }));
    }, []);

    const applyHierarchyPreset = useCallback((preset) => {
        const PRESET_MAP = {
            subtle: {
                hierarchySizing: true,
                rootScalePercent: 100,
                levelScaleStepPercent: 4,
                minScalePercent: 86,
            },
            balanced: {
                hierarchySizing: true,
                rootScalePercent: 104,
                levelScaleStepPercent: 6,
                minScalePercent: 82,
            },
            strong: {
                hierarchySizing: true,
                rootScalePercent: 110,
                levelScaleStepPercent: 8,
                minScalePercent: 76,
            },
        };

        const patch = PRESET_MAP[preset];
        if (!patch) return;

        setDraft((prev) => ({
            ...prev,
            flowCanvas: normalizeFlowCanvasSettings(
                {
                    ...(prev.flowCanvas || DEFAULT_ORG_CHART.flowCanvas),
                    ...patch,
                },
                DEFAULT_ORG_CHART.flowCanvas
            ),
        }));
    }, []);

    const handleFlowPositionsSave = useCallback(async (nodePositions) => {
        const nextDraft = {
            ...cloneOrgChart(latestDraftRef.current),
            layoutDirection: 'flow-canvas',
            nodePositions: normalizeNodePositions(nodePositions),
        };

        setIsSaving(true);
        setSaveMessage(null);
        const success = await saveOrgChart(nextDraft);
        setIsSaving(false);

        if (!success) {
            setSaveMessage({ type: 'error', text: 'שמירת מיקומי הצמתים נכשלה. ניתן לנסות שוב.' });
            return false;
        }

        return true;
    }, [saveOrgChart]);

    const toggleExpand = useCallback((nodeId) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const openAddModal = useCallback((parentId = ROOT_NODE_ID) => {
        setModalState({ mode: 'add', parentId, form: createNodeDraft() });
    }, []);

    const openEditModal = useCallback((node) => {
        setActiveNodeId(node.id);
        setModalState({
            mode: 'edit',
            nodeId: node.id,
            form: { ...createNodeDraft(), ...node, children: [] },
        });
    }, []);

    const closeModal = useCallback(() => {
        setModalState(null);
        setUploadingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleDelete = useCallback((node) => {
        confirmToast({
            title: 'מחיקת צומת',
            message: `למחוק את "${displayName(node)}" ואת כל הכפיפים תחתיו?`,
            confirmText: 'מחק',
            cancelText: 'ביטול',
            type: 'warning',
        }).then((confirmed) => {
            if (!confirmed) return;
            setDraft((prev) => ({ ...prev, nodes: removeNodeById(prev.nodes, node.id) }));
            setActiveNodeId((prev) => (prev === node.id ? null : prev));
        });
    }, []);

    const updateModalForm = (field, value) => {
        setModalState((prev) => (prev ? { ...prev, form: { ...prev.form, [field]: value } } : prev));
    };

    const handleModalImageUpload = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file || !modalState) return;
        setUploadingImage(true);
        try {
            const imageUrl = await uploadImage(file, 'OrgChart');
            updateModalForm('imageUrl', imageUrl);
        } catch (err) {
            spLog.error('AdminOrgChart: image upload failed.', err);
            setSaveMessage({ type: 'error', text: `העלאת התמונה נכשלה: ${err.message}` });
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [modalState]);

    const saveModalNode = (event) => {
        event.preventDefault();
        if (!modalState) return;

        const normalizedNode = {
            id: modalState.form.id || createNodeId(),
            name: modalState.form.name.trim(),
            rank: modalState.form.rank,
            role: modalState.form.role.trim(),
            personalNumber: normalizePersonalNumberInput(modalState.form.personalNumber),
            imageUrl: modalState.form.imageUrl || '',
            children: [],
        };

        setDraft((prev) => {
            if (modalState.mode === 'edit') {
                return {
                    ...prev,
                    nodes: updateNodeById(prev.nodes, modalState.nodeId, (node) => ({
                        ...node,
                        ...normalizedNode,
                        children: node.children,
                    })),
                };
            }

            if (modalState.parentId === ROOT_NODE_ID) {
                return { ...prev, nodes: [...prev.nodes, normalizedNode] };
            }

            return {
                ...prev,
                nodes: updateNodeById(prev.nodes, modalState.parentId, (node) => ({
                    ...node,
                    children: [...node.children, normalizedNode],
                })),
            };
        });

        if (modalState.parentId) {
            setExpandedIds((prev) => {
                const next = new Set(prev);
                next.add(ROOT_NODE_ID);
                next.add(modalState.parentId);
                return next;
            });
        }

        setActiveNodeId(normalizedNode.id);
        closeModal();
    };

    const renderTreeNode = (node, depthLevel = 0) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const isActive = activeNodeId === node.id;
        const mailto = personalNumberToArmyMailto(node.personalNumber);

        return (
            <div key={node.id} className="space-y-3">
                <div
                    className={`flex items-center gap-3 rounded-[24px] border px-4 py-3 transition ${
                        isActive
                            ? 'border-primary/40 bg-primary/10 shadow-[0_14px_32px_rgba(8,145,178,0.14)]'
                            : 'border-gray-200 bg-white/90 hover:border-primary/25 dark:border-white/10 dark:bg-white/[0.04]'
                    }`}
                    style={{ marginRight: `${depthLevel * 24}px` }}
                >
                    <button
                        type="button"
                        onClick={() => hasChildren && toggleExpand(node.id)}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                            hasChildren ? 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10' : 'pointer-events-none text-transparent'
                        }`}
                        aria-label={isExpanded ? 'סגור כפיפים' : 'פתח כפיפים'}
                    >
                        <ChevronLeft size={16} className={`transition-transform ${isExpanded ? '-rotate-90' : ''}`} />
                    </button>

                    <NodeAvatar node={node} avatarShape={draft.avatarShape} />

                    <div className="min-w-0 flex-1 text-right">
                        <div className="flex min-w-0 items-center gap-2">
                            <button type="button" onClick={() => setActiveNodeId(node.id)} className="min-w-0 flex-1 text-right">
                                <span className="block truncate text-sm font-black text-gray-900 dark:text-white">{displayName(node)}</span>
                            </button>
                            <OrgChartMailLink
                                href={mailto}
                                label={displayName(node)}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary transition hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                iconSize={14}
                            />
                        </div>
                        <button type="button" onClick={() => setActiveNodeId(node.id)} className="mt-1 block max-w-full text-right">
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{subtitle(node)}</span>
                        </button>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        <Tooltip text="הוסף כפיף">
                            <button type="button" onClick={() => openAddModal(node.id)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-300">
                                <Plus size={16} />
                            </button>
                        </Tooltip>
                        <Tooltip text="ערוך צומת">
                            <button type="button" onClick={() => openEditModal(node)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition hover:bg-primary/20">
                                <Pencil size={16} />
                            </button>
                        </Tooltip>
                        <Tooltip text="מחק צומת">
                            <button type="button" onClick={() => handleDelete(node)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-600 transition hover:bg-red-500/20 dark:text-red-300">
                                <Trash2 size={16} />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {hasChildren && isExpanded && (
                    <div className="mr-6 space-y-3 border-r border-primary/20 pr-4">
                        {node.children.map((child) => renderTreeNode(child, depthLevel + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (loading && lastSavedRef.current === null) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען עץ מבנה...</div>;
    }

    const modalPersonalNumber = normalizePersonalNumberInput(modalState?.form?.personalNumber);
    const modalPersonalNumberInvalid = Boolean(modalPersonalNumber && !isValidPersonalNumber(modalPersonalNumber));
    const modalMailto = personalNumberToArmyMailto(modalPersonalNumber);

    const renderDesignTab = () => (
        <div className="space-y-6">
            {activeTab === 'design-basic' && <SettingCard
                title="הגדרות בסיס"
                description={'קובעים את שם העמוד\nוהאם להציג אותו למשתמשים באתר.'}
                helpTitle="הגדרות בסיס"
                helpDescription="העמוד יכול להיות מוכן ומעוצב גם לפני שמפעילים אותו בפועל למשתמשים."
            >
                <div className="grid grid-cols-1 gap-4">
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4 shadow-sm dark:border-white/10 dark:from-[#1b1f2a] dark:to-[#171b24]">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                                    <Monitor size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-black text-gray-900 dark:text-white">הפעלת הדף</div>
                                    <div className="whitespace-pre-line text-xs text-gray-500 dark:text-gray-400">{'מציג את הקישור\nבכותרת האתר'}</div>
                                </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${draft.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
                                {draft.enabled ? 'פעיל' : 'כבוי'}
                            </span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={draft.enabled}
                            onClick={() => updateDraftField('enabled', !draft.enabled)}
                            className="group flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-white/10 dark:bg-[#202532] dark:hover:border-primary/40 dark:hover:bg-primary/10"
                        >
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{draft.enabled ? 'הדף פעיל' : 'הדף כבוי'}</span>
                            <span className={`relative inline-flex h-7 w-12 rounded-full transition ${draft.enabled ? 'bg-green-500/80' : 'bg-gray-300 dark:bg-white/10'}`}>
                                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${draft.enabled ? 'right-0.5' : 'right-[1.55rem]'}`} />
                            </span>
                        </button>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4 shadow-sm dark:border-white/10 dark:from-[#1b1f2a] dark:to-[#171b24]">
                        <HelpLabel
                            as="span"
                            className="text-sm font-bold text-gray-800 dark:text-gray-200"
                            wrapperClassName="mb-2 flex items-center gap-2"
                            helpTitle="כותרת העמוד"
                            helpDescription="זה הטקסט שיופיע בראש דף עץ המבנה למשתמשי האתר וגם בקישור הניווט הציבורי."
                        >
                            כותרת עמוד
                        </HelpLabel>
                        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">שם קצר וברור יעזור למשתמשים לזהות את הדף בניווט.</p>
                        <input
                            type="text"
                            value={draft.pageTitle}
                            onChange={(event) => updateDraftField('pageTitle', event.target.value)}
                            className={`${inputCls} h-11`}
                            placeholder="לדוגמה: עץ מבנה יחידתי"
                        />
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4 shadow-sm dark:border-white/10 dark:from-[#1b1f2a] dark:to-[#171b24]">
                        <div className="mb-3">
                            <div className="text-sm font-black text-gray-900 dark:text-white">ייצוא וייבוא עץ</div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">שמירה או שחזור של עץ המבנה כקובץ JSON. הייבוא מחליף את העץ הנוכחי לאחר אישור.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={handleExportStructureTree}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                            >
                                <Download size={16} />
                                ייצוא עץ
                            </button>
                            <button
                                type="button"
                                onClick={() => structureImportInputRef.current?.click()}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                            >
                                <Upload size={16} />
                                ייבוא עץ
                            </button>
                            <input
                                ref={structureImportInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={handleImportStructureTree}
                            />
                        </div>
                    </div>
                </div>
            </SettingCard>}

            {activeTab === 'design-layout' && <SettingCard title="כיוון פריסת העץ" description="בחרו איך ההיררכיה זורמת על הדף במצב דו-מימדי: עץ מרכזי או פריסה מדורגת לצד." helpTitle="כיוון פריסת העץ" helpDescription="הגדרה זו קובעת את מנוע הפריסה הדו-מימדי, כולל אופן ציור קווי החיבור בין המפקד לכפיפים.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {LAYOUT_DIRECTION_OPTIONS.map((option) => (
                        <OptionCard key={option.value} option={option} isActive={draft.layoutDirection === option.value} onSelect={() => updateDraftField('layoutDirection', option.value)} />
                    ))}
                </div>

                <div className="mt-4 rounded-2xl border border-sky-300/50 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-900/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-bold text-sky-900 dark:text-sky-200">
                            מצב תלת-מימד ומצב קנבס זרימה מנוהלים בטאבים ייעודיים.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('design-flow')}
                                className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition hover:brightness-110"
                            >
                                מעבר לטאב קנבס זרימה
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('design-3d')}
                                className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:brightness-110"
                            >
                                מעבר לטאב גרף תלת-מימדי
                            </button>
                        </div>
                    </div>
                </div>
            </SettingCard>}

            {activeTab === 'design-flow' && <SettingCard
                title="קנבס זרימה - עריכה מתקדמת"
                description="כאן מסדרים את העץ בצורה חזותית, שומרים מיקומים, ומגדירים איך הוא ייראה למשתמשים."
                helpTitle="קנבס זרימה"
                helpDescription="פשוט לגרור, ליישר ולשמור. אין צורך בידע טכני כדי לסדר את המבנה."
            >
                <div className="space-y-4 [&_select]:rounded-2xl [&_select]:border [&_select]:border-gray-200 [&_select]:bg-white [&_select]:font-semibold [&_select]:shadow-sm dark:[&_select]:border-white/10 dark:[&_select]:bg-white/[0.06] [&_input[type='number']]:rounded-2xl [&_input[type='number']]:border [&_input[type='number']]:border-gray-200 [&_input[type='number']]:bg-white [&_input[type='number']]:shadow-sm dark:[&_input[type='number']]:border-white/10 dark:[&_input[type='number']]:bg-white/[0.06]">
                    {/* <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-gray-900 dark:text-white">מצב פעיל</p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {draft.layoutDirection === 'flow-canvas'
                                        ? 'קנבס הזרימה פעיל כפריסה הראשית של העמוד.'
                                        : 'קנבס הזרימה עדיין לא נבחר כפריסה הראשית.'}
                                </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                                draft.layoutDirection === 'flow-canvas'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                            }`}>
                                {draft.layoutDirection === 'flow-canvas' ? 'פעיל' : 'כבוי'}
                            </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => updateDraftField('layoutDirection', 'flow-canvas')}
                                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
                            >
                                הפעל קנבס זרימה
                            </button>
                            <button
                                type="button"
                                onClick={() => updateDraftField('layoutDirection', '3d-graph')}
                                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-800 transition hover:bg-gray-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                            >
                                מעבר לגרף 3D
                            </button>
                        </div>
                    </div> */}

                    <div className="rounded-2xl border border-primary/20 bg-white p-4 dark:border-primary/30 dark:bg-[#1b1f2a]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-gray-900 dark:text-white">יישור היררכי אוטומטי</p>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                    כפתורי היישור מופיעים גם ישירות בקנבס, ושומרים על היררכיה לפי מצב מרכוז / ימין לשמאל / שמאל לימין.
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-1 rounded-2xl border border-primary/20 bg-gray-50 p-1 dark:border-primary/25 dark:bg-white/5">
                                {FLOW_AUTO_LAYOUT_OPTIONS.map((option) => {
                                    const isActive = (draft.flowCanvas?.autoLayoutDirection ?? 'center') === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => updateFlowCanvasField('autoLayoutDirection', option.value)}
                                            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                                                isActive
                                                    ? 'bg-primary text-white shadow-[0_8px_20px_rgba(8,145,178,0.3)]'
                                                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                        <HelpLabel
                            as="span"
                            className="text-sm font-bold text-gray-800 dark:text-gray-200"
                            wrapperClassName="mb-3 flex items-center gap-2"
                            helpTitle="צורת אווטאר לקנבס"
                            helpDescription="הצורה משפיעה גם על כרטיסי קנבס הזרימה וגם על תצוגת העמוד בזמן אמת."
                        >
                            צורת אווטאר בקנבס זרימה
                        </HelpLabel>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {AVATAR_SHAPE_OPTIONS.map((option) => (
                                <OptionCard
                                    key={option.value}
                                    option={option}
                                    isActive={draft.avatarShape === option.value}
                                    onSelect={() => updateDraftField('avatarShape', option.value)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white">סקשן 1: מראה קווים ורקע</h3>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">בחרו איך הקווים והרקע נראים, כדי שהעץ יהיה ברור ונעים לעין.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="סוג קווים"
                                helpDescription="אפשר לבחור סגנון קו ברור: ישר, מדורג או מעוגל."
                            >
                                סוג קו בקנבס
                            </HelpLabel>
                            <select
                                value={draft.flowCanvas?.edgeType ?? 'smoothstep'}
                                onChange={(event) => updateFlowCanvasField('edgeType', event.target.value)}
                                className={inputCls}
                            >
                                <option value="smoothstep"> רגיל</option>
                                <option value="default">מעוגל </option>
                                <option value="straight">ישר</option>
                                {/* <option value="step">מדורג</option>
                                <option value="simplebezier">מעוגל עדין</option> */}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="עוצמת קווים"
                                helpDescription="כך שולטים בעובי, בשקיפות ובתנועה של הקווים."
                            >
                                עיצוב קווים
                            </HelpLabel>

                            <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.edgeAnimated ?? DEFAULT_ORG_CHART.flowCanvas.edgeAnimated}
                                    onChange={(event) => updateFlowCanvasField('edgeAnimated', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                קווים מונפשים
                            </label>

                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">עובי קו</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={6}
                                        value={draft.flowCanvas?.edgeStrokeWidth ?? 2}
                                        onChange={(event) => updateFlowCanvasField('edgeStrokeWidth', Number(event.target.value))}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">שקיפות קו (%)</label>
                                    <input
                                        type="number"
                                        min={20}
                                        max={100}
                                        value={draft.flowCanvas?.edgeOpacityPercent ?? 88}
                                        onChange={(event) => updateFlowCanvasField('edgeOpacityPercent', Number(event.target.value))}
                                        className={inputCls}
                                    />
                                </div>
                            </div>
                        </div>

                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                                <HelpLabel
                                    as="span"
                                    className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="רקע קנבס"
                                    helpDescription="בחרו את דוגמת הרקע שתעזור לראות את הקנבס בצורה נוחה."
                                >
                                    וריאנט רקע
                                </HelpLabel>
                                <select
                                    value={draft.flowCanvas?.backgroundVariant ?? 'dots'}
                                    onChange={(event) => updateFlowCanvasField('backgroundVariant', event.target.value)}
                                    className={inputCls}
                                >
                                    <option value="dots">נקודות</option>
                                    <option value="lines">קווים</option>
                                    <option value="cross">צלב</option>
                                </select>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                                <HelpLabel
                                    as="span"
                                    className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="ריווח רקע"
                                    helpDescription="ריווח גדול יותר יוצר רשת רקע מרווחת יותר."
                                >
                                    ריווח רקע
                                </HelpLabel>
                                <input
                                    type="number"
                                    min={8}
                                    max={120}
                                    value={draft.flowCanvas?.backgroundGap ?? 18}
                                    onChange={(event) => updateFlowCanvasField('backgroundGap', Number(event.target.value))}
                                    className={inputCls}
                                />
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                                <HelpLabel
                                    as="span"
                                    className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="גודל רכיב רקע"
                                    helpDescription="קובע את גודל הדוגמה שמופיעה ברקע."
                                >
                                    גודל דוגמת רקע
                                </HelpLabel>
                                <input
                                    type="number"
                                    min={1}
                                    max={18}
                                    value={draft.flowCanvas?.backgroundSize ?? 1}
                                    onChange={(event) => updateFlowCanvasField('backgroundSize', Number(event.target.value))}
                                    className={inputCls}
                                />
                            </div>
                        </div>


                    <div className="rounded-2xl border border-primary/20 bg-white p-4 dark:border-primary/30 dark:bg-[#1b1f2a]">
                        <HelpLabel
                            as="span"
                            className="text-sm font-bold text-gray-900 dark:text-white"
                            wrapperClassName="mb-2 flex items-center gap-2"
                            helpTitle="פריסטים לתצוגה"
                            helpDescription="בחירה מהירה שמעדכנת כמה הגדרות יחד לקבלת מראה שונה של הכרטיסים והקווים."
                        >
                            מצבי תצוגה מהירים
                        </HelpLabel>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            {FLOW_VISUAL_PRESET_OPTIONS.map((preset) => {
                                const isActive = draft.flowCanvas?.nodeVisualStyle === preset.value;
                                return (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => applyFlowVisualPreset(preset.value)}
                                        className={`rounded-xl border px-3 py-2 text-right transition ${
                                            isActive
                                                ? 'border-primary/45 bg-primary/15 text-primary dark:text-primary'
                                                : 'border-gray-200 bg-white/70 text-gray-700 hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        <div className="text-xs font-black">{preset.label}</div>
                                        <div className="mt-1 text-[11px] leading-5 opacity-90">{preset.description}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <h3 className="text-sm font-black text-gray-900 dark:text-white">סקשן 2: מראה כרטיסים והיררכיה</h3>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">הגדירו מה יוצג בכרטיס, ומי יופיע בולט יותר לפי רמת הפיקוד.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="סגנון כרטיס"
                                helpDescription="בחירה בין סגנון פיקודי מודגש, נקי או מינימלי."
                            >
                                מראה כרטיסים
                            </HelpLabel>
                            <select
                                value={draft.flowCanvas?.nodeVisualStyle ?? 'command'}
                                onChange={(event) => updateFlowCanvasField('nodeVisualStyle', event.target.value)}
                                className={inputCls}
                            >
                                <option value="command">פיקודי מודגש</option>
                                <option value="clean">נקי להצגה</option>
                                <option value="minimal">מינימלי מהיר</option>
                            </select>

                            <div className="mt-3 space-y-2">
                                <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                    <input
                                        type="checkbox"
                                        checked={draft.flowCanvas?.showAvatar ?? true}
                                        onChange={(event) => updateFlowCanvasField('showAvatar', event.target.checked)}
                                        className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                    />
                                    הצג אווטאר
                                </label>
                                <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                    <input
                                        type="checkbox"
                                        checked={draft.flowCanvas?.showRank ?? true}
                                        onChange={(event) => updateFlowCanvasField('showRank', event.target.checked)}
                                        className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                    />
                                    הצג דרגה
                                </label>
                                <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                    <input
                                        type="checkbox"
                                        checked={draft.flowCanvas?.showRole ?? true}
                                        onChange={(event) => updateFlowCanvasField('showRole', event.target.checked)}
                                        className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                    />
                                    הצג תפקיד
                                </label>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="הדגשת היררכיה"
                                helpDescription="הגדרה פשוטה שמבטיחה שכל מי שמעליך בהיררכיה יוצג קצת גדול יותר."
                            >
                                היררכיה דינמית
                            </HelpLabel>

                            <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.hierarchySizing ?? true}
                                    onChange={(event) => updateFlowCanvasField('hierarchySizing', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                הפעל יחס קבוע בין דרגות
                            </label>

                            {(draft.flowCanvas?.hierarchySizing ?? true) && (
                                <>
                                    <p className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.05] px-3 py-2 text-xs text-gray-700 dark:border-primary/30 dark:bg-primary/[0.10] dark:text-gray-200">
                                        כלל פשוט: כל דרג מתחת קטן ב־<span className="font-black">{draft.flowCanvas?.levelScaleStepPercent ?? 6}%</span> מהדרג שמעליו.
                                    </p>

                                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                                        <button
                                            type="button"
                                            onClick={() => applyHierarchyPreset('subtle')}
                                            className="rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                        >
                                            עדין (4%)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyHierarchyPreset('balanced')}
                                            className="rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                        >
                                            מאוזן (6%)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyHierarchyPreset('strong')}
                                            className="rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                        >
                                            מודגש (8%)
                                        </button>
                                    </div>

                                    <div className="mt-3">
                                        <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">כמה יותר גדול יהיה הדרג שמעליך (%)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={20}
                                            value={draft.flowCanvas?.levelScaleStepPercent ?? 6}
                                            onChange={(event) => updateFlowCanvasField('levelScaleStepPercent', Number(event.target.value))}
                                            className={inputCls}
                                        />
                                    </div>

                                    <details className="mt-3 rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                                        <summary className="cursor-pointer text-xs font-black text-gray-700 dark:text-gray-200">
                                            הגדרות מתקדמות
                                        </summary>
                                        <div className="mt-3 grid grid-cols-1 gap-3">
                                            <div>
                                                <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">גודל הדרג הבכיר ביותר (%)</label>
                                                <input
                                                    type="number"
                                                    min={100}
                                                    max={150}
                                                    value={draft.flowCanvas?.rootScalePercent ?? 112}
                                                    onChange={(event) => updateFlowCanvasField('rootScalePercent', Number(event.target.value))}
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">הגודל המינימלי שממנו לא יורדים (%)</label>
                                                <input
                                                    type="number"
                                                    min={70}
                                                    max={100}
                                                    value={draft.flowCanvas?.minScalePercent ?? 84}
                                                    onChange={(event) => updateFlowCanvasField('minScalePercent', Number(event.target.value))}
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>
                                    </details>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2 rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                            <h3 className="text-sm font-black text-gray-900 dark:text-white">סקשן 3: ניווט ובקרה</h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">כאן קובעים איך לזוז על הקנבס ואילו כפתורי ניווט להציג.</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מצב ניווט"
                                helpDescription="מצב ניווט חופשי לעבודה מהירה, או מצב עריכה מדויקת עם רשת."
                            >
                                מצב ניווט
                            </HelpLabel>
                            <select
                                value={draft.flowCanvas?.viewportMode ?? 'map'}
                                onChange={(event) => updateFlowCanvasField('viewportMode', event.target.value)}
                                className={inputCls}
                            >
                                <option value="map">ניווט חופשי</option>
                                <option value="design">עריכה מדויקת</option>
                            </select>

                            <label className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.panOnScroll ?? false}
                                    onChange={(event) => updateFlowCanvasField('panOnScroll', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                גרירה בעזרת הגלגלת
                            </label>
                            <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.zoomOnDoubleClick ?? true}
                                    onChange={(event) => updateFlowCanvasField('zoomOnDoubleClick', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                זום בלחיצה כפולה
                            </label>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מפת ניווט ובקרים"
                                helpDescription="קבעו אילו כלי ניווט יופיעו במסך, כדי לעבוד בנוחות."
                            >
                                כלי ניווט
                            </HelpLabel>

                            <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.showMiniMap ?? true}
                                    onChange={(event) => updateFlowCanvasField('showMiniMap', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                הצג מפת ניווט
                            </label>
                            <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.miniMapPannable ?? true}
                                    onChange={(event) => updateFlowCanvasField('miniMapPannable', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                גרירה במפת הניווט
                            </label>
                            <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.miniMapZoomable ?? false}
                                    onChange={(event) => updateFlowCanvasField('miniMapZoomable', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                זום במפת הניווט
                            </label>

                            <label className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.showControls ?? true}
                                    onChange={(event) => updateFlowCanvasField('showControls', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                הצג בקרי ניווט
                            </label>
                            <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.showControlZoom ?? true}
                                    onChange={(event) => updateFlowCanvasField('showControlZoom', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                כפתורי זום
                            </label>
                            <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.showControlFitView ?? true}
                                    onChange={(event) => updateFlowCanvasField('showControlFitView', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                כפתור התאמה למסך
                            </label>
                            <label className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.showControlInteractive ?? false}
                                    onChange={(event) => updateFlowCanvasField('showControlInteractive', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                כפתור נעילה/עריכה
                            </label>

                            {/* <div className="mt-3">
                                <HelpLabel
                                    as="span"
                                    className="text-xs font-bold text-gray-700 dark:text-gray-200"
                                    wrapperClassName="mb-1 flex items-center gap-2"
                                helpTitle="כיוון בקרי ניווט"
                                helpDescription="קובע אם הבקרים יוצגו לאורך או לרוחב."
                            >
                                    כיוון בקרי ניווט
                                </HelpLabel>
                                <select
                                    value={draft.flowCanvas?.controlsOrientation ?? 'vertical'}
                                    onChange={(event) => updateFlowCanvasField('controlsOrientation', event.target.value)}
                                    className={inputCls}
                                >
                                    <option value="vertical">אנכי</option>
                                    <option value="horizontal">אופקי</option>
                                </select>
                            </div> */}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2 rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                            <h3 className="text-sm font-black text-gray-900 dark:text-white">סקשן 4: דיוק וביצועים</h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">קבעו הצמדה לגריד ושפרו מהירות בעבודה על מבנים גדולים.</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="הצמדה לרשת"
                                helpDescription="מסייע ליישר צמתים בדיוק על קווים קבועים."
                            >
                                הצמדה לרשת
                            </HelpLabel>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.snapToGrid ?? false}
                                    onChange={(event) => updateFlowCanvasField('snapToGrid', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                הפעל הצמדה
                            </label>

                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">מרווח אופקי</label>
                                    <input
                                        type="number"
                                        min={8}
                                        max={160}
                                        value={draft.flowCanvas?.snapGridX ?? 20}
                                        onChange={(event) => updateFlowCanvasField('snapGridX', Number(event.target.value))}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">מרווח אנכי</label>
                                    <input
                                        type="number"
                                        min={8}
                                        max={160}
                                        value={draft.flowCanvas?.snapGridY ?? 20}
                                        onChange={(event) => updateFlowCanvasField('snapGridY', Number(event.target.value))}
                                        className={inputCls}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="ביצועים ותיחום תצוגה"
                                helpDescription="שפרו ביצועים במבנים גדולים והגדירו שוליים אוטומטיים לתצוגה."
                            >
                                ביצועים
                            </HelpLabel>
                            <label className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                                <input
                                    type="checkbox"
                                    checked={draft.flowCanvas?.onlyRenderVisibleElements ?? false}
                                    onChange={(event) => updateFlowCanvasField('onlyRenderVisibleElements', event.target.checked)}
                                    className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                />
                                טען רק פריטים שנמצאים על המסך
                            </label>
                            <div className="mt-3">
                                <label className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">שוליים בהתאמה למסך (%)</label>
                                <input
                                    type="number"
                                    min={5}
                                    max={80}
                                    value={draft.flowCanvas?.fitViewPaddingPercent ?? 24}
                                    onChange={(event) => updateFlowCanvasField('fitViewPaddingPercent', Number(event.target.value))}
                                    className={inputCls}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 text-sm text-gray-700 dark:border-primary/30 dark:bg-primary/[0.10] dark:text-gray-200">
                        עריכה חיה מתבצעת בפאנל התצוגה משמאל. לאחר גרירה, יש ללחוץ על הכפתור "שמור מיקומים" בתוך הקנבס כדי לנעול את המיקומים לציבור.
                    </div>
                </div>
            </SettingCard>}

            {activeTab === 'design-3d' && <SettingCard title="גרף תלת-מימדי" description="דף הגדרות ייעודי להצגה תלת-מימדית עם פתיחה הדרגתית לצמצום עומס ויזואלי." helpTitle="גרף תלת-מימדי" helpDescription="הגרף מתאים למבנים גדולים. לחיצה על צומת פותחת או סוגרת את הכפיפים הישירים שלו.">
                <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-gray-900 dark:text-white">מצב פריסה פעיל</p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {draft.layoutDirection === '3d-graph'
                                        ? 'כרגע הדף מציג גרף תלת-מימדי.'
                                        : 'כרגע הדף במצב דו-מימדי.'}
                                </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                                draft.layoutDirection === '3d-graph'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                            }`}>
                                {draft.layoutDirection === '3d-graph' ? 'תלת-מימדי פעיל' : 'תלת-מימדי כבוי'}
                            </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => updateDraftField('layoutDirection', '3d-graph')}
                                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
                            >
                                הפעל גרף תלת-מימדי
                            </button>
                            <button
                                type="button"
                                onClick={() => updateDraftField('layoutDirection', 'flow-canvas')}
                                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-800 transition hover:bg-gray-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                            >
                                חזרה לקנבס זרימה
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="סוג פריסה"
                                helpDescription="בחירת שיטת סידור תלת-מימדית. כדאי לבחור לפי נוחות הקריאה של המבנה."
                            >
                                אלגוריתם פריסה
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.layoutType ?? 'forceDirected3d'}
                                onChange={(event) => updateGraph3dField('layoutType', event.target.value)}
                                className={inputCls}
                            >
                                {GRAPH_3D_LAYOUT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מצלמה"
                                helpDescription="שליטה על אופן הניווט בחלל: סיבוב, מסלול, תזוזה או תצוגה ישרה."
                            >
                                מצב מצלמה
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.cameraMode ?? 'rotate'}
                                onChange={(event) => updateGraph3dField('cameraMode', event.target.value)}
                                className={inputCls}
                            >
                                {GRAPH_3D_CAMERA_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="עומק פתיחה התחלתי"
                                helpDescription="כמה שכבות נפתחות כברירת מחדל: 1 (שורש+כפיפים ישירים) או 2 (כולל דרגה נוספת)."
                            >
                                עומק פתיחה התחלתי
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.initialExpandLevels ?? 1}
                                onChange={(event) => updateGraph3dField('initialExpandLevels', Number(event.target.value))}
                                className={inputCls}
                            >
                                <option value={1}>1 - שורש + שכבה ראשונה</option>
                                <option value={2}>2 - שורש + שתי שכבות</option>
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מצב תוויות"
                                helpDescription="שולט בכמות הטקסט המוצגת על הצמתים/קשרים בזמן תנועה."
                            >
                                תצוגת תוויות
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.labelType ?? 'all'}
                                onChange={(event) => updateGraph3dField('labelType', event.target.value)}
                                className={inputCls}
                            >
                                {GRAPH_3D_LABEL_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="סגנון קווים"
                                helpDescription="קו מעוגל נראה רך יותר, וקו ישר נותן מראה חד ומדויק."
                            >
                                צורת קווים
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.edgeInterpolation ?? 'curved'}
                                onChange={(event) => updateGraph3dField('edgeInterpolation', event.target.value)}
                                className={inputCls}
                            >
                                {GRAPH_3D_EDGE_INTERPOLATION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מיקום חץ"
                                helpDescription="מיקום ראש החץ על הקו: בסוף, באמצע או ללא חצים."
                            >
                                חצים על קשרים
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.edgeArrowPosition ?? 'end'}
                                onChange={(event) => updateGraph3dField('edgeArrowPosition', event.target.value)}
                                className={inputCls}
                            >
                                {GRAPH_3D_EDGE_ARROW_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מיקום תווית קשר"
                                helpDescription="שליטה על מיקום תוויות טקסט ביחס לקו הקשר."
                            >
                                מיקום תווית קשר
                            </HelpLabel>
                            <select
                                value={draft.graph3d?.edgeLabelPosition ?? 'natural'}
                                onChange={(event) => updateGraph3dField('edgeLabelPosition', event.target.value)}
                                className={inputCls}
                            >
                                {GRAPH_3D_EDGE_LABEL_POSITION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מרחק קישורים"
                                helpDescription="מרחק בסיסי בין צמתים מחוברים. ערך גבוה מרווח את הגרף."
                            >
                                מרחק קישורים
                            </HelpLabel>
                            <input
                                type="number"
                                min={80}
                                max={420}
                                value={draft.graph3d?.linkDistance ?? 180}
                                onChange={(event) => updateGraph3dField('linkDistance', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="עוצמת דחייה"
                                helpDescription="ערך שלילי שקובע עד כמה הצמתים דוחים זה את זה כדי למנוע צפיפות."
                            >
                                עוצמת דחייה
                            </HelpLabel>
                            <input
                                type="number"
                                min={-700}
                                max={-40}
                                value={draft.graph3d?.nodeStrength ?? -220}
                                onChange={(event) => updateGraph3dField('nodeStrength', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מרחק מצלמה מינימלי"
                                helpDescription="כמה קרוב אפשר להתקרב למבנה."
                            >
                                מרחק מינימלי
                            </HelpLabel>
                            <input
                                type="number"
                                min={80}
                                max={4000}
                                value={draft.graph3d?.minDistance ?? 160}
                                onChange={(event) => updateGraph3dField('minDistance', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <HelpLabel
                                as="span"
                                className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                wrapperClassName="mb-2 flex items-center gap-2"
                                helpTitle="מרחק מצלמה מקסימלי"
                                helpDescription="כמה רחוק אפשר להתרחק מהגרף."
                            >
                                מרחק מקסימלי
                            </HelpLabel>
                            <input
                                type="number"
                                min={1200}
                                max={30000}
                                value={draft.graph3d?.maxDistance ?? 12000}
                                onChange={(event) => updateGraph3dField('maxDistance', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <label className="mb-2 block text-sm font-bold text-gray-800 dark:text-gray-200">גודל צומת בסיסי</label>
                            <input
                                type="number"
                                min={4}
                                max={28}
                                value={draft.graph3d?.defaultNodeSize ?? 9}
                                onChange={(event) => updateGraph3dField('defaultNodeSize', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <label className="mb-2 block text-sm font-bold text-gray-800 dark:text-gray-200">גודל צומת מינימלי</label>
                            <input
                                type="number"
                                min={2}
                                max={24}
                                value={draft.graph3d?.minNodeSize ?? 6}
                                onChange={(event) => updateGraph3dField('minNodeSize', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <label className="mb-2 block text-sm font-bold text-gray-800 dark:text-gray-200">גודל צומת מקסימלי</label>
                            <input
                                type="number"
                                min={4}
                                max={48}
                                value={draft.graph3d?.maxNodeSize ?? 18}
                                onChange={(event) => updateGraph3dField('maxNodeSize', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <label className="mb-2 block text-sm font-bold text-gray-800 dark:text-gray-200">זום מינימלי</label>
                            <input
                                type="number"
                                min={1}
                                max={40}
                                value={draft.graph3d?.minZoom ?? 1}
                                onChange={(event) => updateGraph3dField('minZoom', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <label className="mb-2 block text-sm font-bold text-gray-800 dark:text-gray-200">זום מקסימלי</label>
                            <input
                                type="number"
                                min={4}
                                max={240}
                                value={draft.graph3d?.maxZoom ?? 100}
                                onChange={(event) => updateGraph3dField('maxZoom', Number(event.target.value))}
                                className={inputCls}
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]">
                            <label className="mb-2 block text-sm font-bold text-gray-800 dark:text-gray-200">אינטראקציה וביצועים</label>
                            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={draft.graph3d?.animated ?? true}
                                        onChange={(event) => updateGraph3dField('animated', event.target.checked)}
                                        className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                    />
                                    אנימציה מופעלת
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={draft.graph3d?.draggable ?? false}
                                        onChange={(event) => updateGraph3dField('draggable', event.target.checked)}
                                        className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                    />
                                    גרירת צמתים
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={draft.graph3d?.aggregateEdges ?? false}
                                        onChange={(event) => updateGraph3dField('aggregateEdges', event.target.checked)}
                                        className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10"
                                    />
                                    איחוד קשרים כפולים
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </SettingCard>}

            {activeTab === 'design-layout' && <SettingCard title="עיצוב כרטיסייה" description="בחרו איך כל צומת נראה: מבנה ייצוגי, אופקי, אווטאר מודגש או קומפקטי." helpTitle="עיצוב כרטיסייה" helpDescription="שינוי העיצוב משפיע על צפיפות התרשים ועל האופי הוויזואלי של כל דרג במבנה.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {CARD_STYLE_OPTIONS.map((option) => (
                        <OptionCard key={option.value} option={option} isActive={draft.cardStyle === option.value} onSelect={() => updateDraftField('cardStyle', option.value)} />
                    ))}
                </div>
            </SettingCard>}

            {activeTab === 'design-layout' && <SettingCard title="קווי חיבור" description="קובעים את אופי קווי החיבור בין הדרגים לאורך כל העץ." helpTitle="סגנון קווים" helpDescription="אותו סגנון קו מוחל גם על המבנה המרכזי וגם על פריסות מדורגות ימין-לשמאל ושמאל-לימין.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {LINE_STYLE_OPTIONS.map((option) => (
                        <OptionCard key={option.value} option={option} isActive={draft.lineStyle === option.value} onSelect={() => updateDraftField('lineStyle', option.value)} />
                    ))}
                </div>
            </SettingCard>}

            {activeTab === 'design-layout' && <SettingCard title="צורת אווטאר" description="בחרו את צורת התמונה בכל צומת כדי להתאים לשפה הגרפית של האתר." helpTitle="צורת אווטאר" helpDescription="הצורה חלה על כל התמונות והמצבים החלופיים של ראשי התיבות בעץ.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {AVATAR_SHAPE_OPTIONS.map((option) => (
                        <OptionCard key={option.value} option={option} isActive={draft.avatarShape === option.value} onSelect={() => updateDraftField('avatarShape', option.value)} />
                    ))}
                </div>
            </SettingCard>}
        </div>
    );

    const renderBuildTab = () => (
        <div className="space-y-6">
            <section className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] flex flex-col justify-center">
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">חוליות</div>
                    <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{totalNodes}</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">צמתים פעילים בעץ</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] flex flex-col justify-center">
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">עומק</div>
                    <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{Math.max(depth, 0)}</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">שכבות עומק במבנה</div>
                </div>
            </section>

            <section className="rounded-[32px] border border-gray-200 bg-white/90 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white">עורך מבנה</h2>
                            <HelpTooltipButton
                                title="שיטת עבודה מומלצת"
                                description="מתחילים מצמתי שורש בלבד. מוסיפים לכל צומת את הכפיפים הישירים שלו. משאירים את העריכה המלאה לחלון הקופץ כדי לשמור על עץ נקי."
                            />
                        </div>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">עץ אנכי קומפקטי לבניית שרשרת הפיקוד. עריכה מלאה מתבצעת בחלון מסודר.</p>
                    </div>
                    <button type="button" onClick={() => openAddModal(ROOT_NODE_ID)} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-white transition hover:brightness-110">
                        <Plus size={16} className='hi'/>
                        הוסף צומת
                    </button>
                </div>

                <div className="max-h-[calc(100vh-360px)] overflow-y-auto p-6 custom-scrollbar">
                    {draft.nodes.length === 0 ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
                            <Users size={42} className="mb-3 text-gray-400 dark:text-gray-600" />
                            <p className="font-bold">עדיין אין עץ מבנה</p>
                            <p className="mt-2 max-w-md text-sm">התחל בהוספת צומת שורש ראשון. לאחר מכן תוכל להוסיף תחתיו כפיפים, ענפים ורמות נוספות.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {draft.nodes.map((node) => renderTreeNode(node))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );

    return (
        <div dir="rtl" className="relative flex h-full flex-col bg-gray-50 font-heebo text-gray-900 dark:bg-[#12141a] dark:text-white">
            <div className="sticky top-0 z-50 shrink-0 border-b border-gray-200 bg-gray-50/95 px-6 pb-4 pt-6 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-[#12141a]/95 sm:px-10">
                <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">עץ מבנה</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">בונה ויזואלי מלא למבנה היררכי: עיצוב בצד אחד, בניית השרשרת בצד השני, ותצוגה מקדימה חיה בכל רגע.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <AdminPageHelpButton pageId="org-chart" />
                        {isSaving && (
                            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-primary border-t-transparent" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">שומר...</span>
                            </div>
                        )}
                    </div>
                </div>

                <nav className="flex w-full items-center gap-2 overflow-x-auto p-1 custom-scrollbar">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`rounded-lg px-4 py-2 text-sm font-bold whitespace-nowrap transition ${
                                activeTab === tab.id
                                    ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                    : 'border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-transparent dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
                {/* <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{TABS.find((tab) => tab.id === activeTab)?.description}</p> */}
            </div>

            {error && <div className="mx-6 mt-6 flex items-center gap-3 rounded-2xl border border-primary-500/40 bg-primary-50 p-4 shadow-sm dark:bg-primary-900/20 sm:mx-10"><AlertTriangle className="shrink-0 text-primary" /><span className="text-sm font-medium text-primary-800 dark:text-primary-200">{error}</span></div>}
            {saveMessage && (
                <div className={`mx-6 mt-6 flex items-center gap-3 rounded-2xl border p-4 shadow-sm sm:mx-10 ${
                    saveMessage.type === 'success'
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-900/25'
                        : 'border-red-300 bg-red-50 dark:border-red-500/20 dark:bg-red-900/30'
                }`}>
                    {saveMessage.type === 'success' ? (
                        <CheckCircle2 className="shrink-0 text-emerald-600 dark:text-emerald-300" />
                    ) : (
                        <AlertTriangle className="shrink-0 text-red-500" />
                    )}
                    <span className={`text-sm ${saveMessage.type === 'success' ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-700 dark:text-red-200'}`}>
                        {saveMessage.text}
                    </span>
                </div>
            )}
            {importError && !saveMessage && (
                <div className="mx-6 mt-6 flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm dark:border-red-500/20 dark:bg-red-900/30 sm:mx-10">
                    <AlertTriangle className="shrink-0 text-red-500" />
                    <span className="text-sm text-red-700 dark:text-red-200">{importError}</span>
                </div>
            )}

            <div className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-0 lg:flex lg:flex-row-reverse lg:items-start lg:gap-6 2xl:gap-8">
                    <div className="lg:flex-[1.08] lg:basis-[54%] lg:max-w-[52vw] lg:min-w-[660px] lg:shrink-0 lg:self-start" dir="rtl">
                        <PreviewMonitor
                            draft={draft}
                            activeTab={activeTab}
                            onSaveFlowPositions={handleFlowPositionsSave}
                            onFlowSettingChange={updateFlowCanvasField}
                        />
                    </div>
                    <div className="space-y-6 lg:flex-[0.92] lg:basis-[46%] lg:min-w-0 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pl-2 custom-scrollbar" dir="rtl">
                            {activeTab === 'build' ? renderBuildTab() : renderDesignTab()}
                    </div>
            </div>

            {modalState && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl overflow-hidden rounded-[34px] border border-gray-200 bg-gray-50 shadow-[0_28px_80px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-[#151922]">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                            <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{modalState.mode === 'edit' ? 'עריכה' : 'הוספה'}</div>
                                <h2 className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{modalState.mode === 'edit' ? 'עריכת צומת' : 'הוספת צומת חדש'}</h2>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">כאן מעדכנים את כל פרטי הצומת במקום אחד, בלי להעמיס על עץ המבנה עצמו.</p>
                            </div>
                            <button type="button" onClick={closeModal} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={saveModalNode} className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                            <div className="space-y-4">
                                <div>
                                    <HelpLabel as="span" className="text-sm font-bold text-gray-800 dark:text-gray-200" helpTitle="שם" helpDescription="השם שיופיע על גבי הכרטיס בעץ." wrapperClassName="mb-2 flex items-center gap-2">שם</HelpLabel>
                                    <input type="text" required value={modalState.form.name} onChange={(event) => updateModalForm('name', event.target.value)} className={inputCls} placeholder="לדוגמה: רס״ן דניאל לוי" />
                                </div>

                                <div>
                                    <HelpLabel as="span" className="text-sm font-bold text-gray-800 dark:text-gray-200" helpTitle="דרגה" helpDescription="בחר את הדרגה שתוצג מתחת לשם בכרטיס." wrapperClassName="mb-2 flex items-center gap-2">דרגה</HelpLabel>
                                    <input
                                        type="text"
                                        list={RANK_DATALIST_ID}
                                        value={modalState.form.rank}
                                        onChange={(event) => updateModalForm('rank', event.target.value)}
                                        className={inputCls}
                                        placeholder="לדוגמה: סא״ל"
                                    />
                                </div>

                                <div>
                                    <HelpLabel as="span" className="text-sm font-bold text-gray-800 dark:text-gray-200" helpTitle="תפקיד" helpDescription="אפשר לבחור תפקיד מהרשימה או להקליד תפקיד מותאם." wrapperClassName="mb-2 flex items-center gap-2">תפקיד</HelpLabel>
                                    <input type="text" list={ROLE_DATALIST_ID} value={modalState.form.role} onChange={(event) => updateModalForm('role', event.target.value)} className={inputCls} placeholder="לדוגמה: מפקד יחידה" />
                                </div>

                                <div>
                                    <HelpLabel
                                        as="span"
                                        className="text-sm font-bold text-gray-800 dark:text-gray-200"
                                        helpTitle="מספר אישי"
                                        helpDescription="שדה אופציונלי. מספר תקין מתחיל ב-S או C ואחריו 7 או 8 ספרות, למשל S1234567."
                                        wrapperClassName="mb-2 flex items-center gap-2"
                                    >
                                        מספר אישי
                                    </HelpLabel>
                                    <input
                                        type="text"
                                        value={modalState.form.personalNumber || ''}
                                        onChange={(event) => updateModalForm('personalNumber', normalizePersonalNumberInput(event.target.value))}
                                        className={`${inputCls} ${modalPersonalNumberInvalid ? 'border-amber-400 focus:border-amber-500 dark:border-amber-400/60' : ''}`}
                                        placeholder="S1234567"
                                        dir="ltr"
                                    />
                                    {modalPersonalNumberInvalid && (
                                        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
                                            הזן מספר אישי תקין, ישמש גם לשליחת מייל למשתמש
                                        </div>
                                    )}
                                    <OrgChartMailLink
                                        href={modalMailto}
                                        label={displayName(modalState.form)}
                                        className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary transition hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                        iconSize={15}
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button type="submit" className="flex-1 rounded-2xl bg-primary px-5 py-3 font-bold text-white transition hover:brightness-110">שמור צומת</button>
                                    <button type="button" onClick={closeModal} className="flex-1 rounded-2xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-800 transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">ביטול</button>
                                </div>
                            </div>

                            <div className="rounded-[28px] border border-gray-200 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-black text-gray-900 dark:text-white">תמונה ו-preview</div>
                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">כך הצומת ייראה בכרטיס בעץ.</div>
                                    </div>
                                    {uploadingImage && <Loader2 size={18} className="animate-spin text-primary" />}
                                </div>

                                <div className="mt-5 flex flex-col items-center text-center">
                                    <NodeAvatar node={modalState.form} avatarShape={draft.avatarShape} size="lg" />
                                    <div className="mt-4 text-lg font-black text-gray-900 dark:text-white">{displayName(modalState.form)}</div>
                                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle(modalState.form)}</div>
                                </div>

                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleModalImageUpload} className="hidden" />

                                <div className="mt-5 space-y-2">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-white transition hover:brightness-110">
                                        <Upload size={16} />
                                        העלה תמונה
                                    </button>
                                    {modalState.form.imageUrl && (
                                        <button type="button" onClick={() => updateModalForm('imageUrl', '')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-800 transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
                                            <ImageIcon size={16} />
                                            נקה תמונה
                                        </button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <datalist id={ROLE_DATALIST_ID}>
                {IDF_ROLES.map((role) => <option key={role} value={role} />)}
            </datalist>
            <datalist id={RANK_DATALIST_ID}>
                {IDF_RANKS.map((rank) => <option key={rank} value={rank} />)}
            </datalist>
        </div>
    );
}
