import RankInsignia from './RankInsignia';

const PRESENTATION_STYLES = Object.freeze({
    formal: {
        insignia: '#b07a32',
        detail: '#fff7e8',
        surface: '#f8fafc',
        edge: '#cbd5e1',
        accent: '#17324d',
    },
    ceremonial: {
        insignia: '#d5b568',
        detail: '#0d2238',
        surface: '#0d2238',
        edge: '#a98a45',
        accent: '#d5b568',
    },
    minimal: {
        insignia: '#334155',
        detail: '#f8fafc',
        surface: 'transparent',
        edge: 'transparent',
        accent: '#94a3b8',
    },
    field: {
        insignia: '#c2bd8b',
        detail: '#35412c',
        surface: '#35412c',
        edge: '#77795d',
        accent: '#8f906c',
    },
});

function PresentationSurface({ styleId, colors, backgroundColor }) {
    const surfaceColor = backgroundColor || colors.surface;
    if (styleId === 'minimal') {
        return backgroundColor ? (
            <g aria-hidden="true">
                <rect data-rank-presentation-surface x="5" y="5" width="290" height="130" rx="12" fill={surfaceColor} />
            </g>
        ) : null;
    }

    if (styleId === 'field') {
        return (
            <g aria-hidden="true">
                <rect data-rank-presentation-surface x="5" y="5" width="290" height="130" rx="14" fill={surfaceColor} stroke={colors.edge} strokeWidth="2" />
                <rect x="13" y="13" width="274" height="114" rx="9" fill="none" stroke={colors.accent} strokeWidth="1.5" strokeDasharray="5 5" />
                <path d="M18 28 H282 M18 112 H282" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="8" />
            </g>
        );
    }

    if (styleId === 'ceremonial') {
        return (
            <g aria-hidden="true">
                <rect data-rank-presentation-surface x="5" y="5" width="290" height="130" rx="10" fill={surfaceColor} stroke={colors.edge} strokeWidth="1.5" />
                <path d="M22 19 H278 M22 121 H278" stroke={colors.accent} strokeWidth="1" />
                <circle cx="24" cy="70" r="3" fill={colors.accent} />
                <circle cx="276" cy="70" r="3" fill={colors.accent} />
            </g>
        );
    }

    return (
        <g aria-hidden="true">
            <rect data-rank-presentation-surface x="5" y="5" width="290" height="130" rx="12" fill={surfaceColor} stroke={colors.edge} strokeWidth="1.5" />
            <path d="M18 24 V16 H26 M274 16 H282 V24 M18 116 V124 H26 M274 124 H282 V116" fill="none" stroke={colors.accent} strokeWidth="2" />
        </g>
    );
}

export default function RankPresentation({ rank, styleId = 'formal', orientation = 'native', rotation = 0, mirrored = false, backgroundColor = '', className = '', style }) {
    const normalizedStyle = PRESENTATION_STYLES[styleId] ? styleId : 'formal';
    const colors = PRESENTATION_STYLES[normalizedStyle];

    return (
        <svg
            viewBox="0 0 300 140"
            preserveAspectRatio="xMidYMid meet"
            className={className}
            style={style}
            data-rank-style={normalizedStyle}
            data-rank-presentation-orientation={orientation}
            xmlns="http://www.w3.org/2000/svg"
        >
            <PresentationSurface styleId={normalizedStyle} colors={colors} backgroundColor={backgroundColor} />
            <RankInsignia
                rank={rank}
                orientation={orientation}
                rotation={rotation}
                mirrored={mirrored}
                color={colors.insignia}
                detailColor={colors.detail}
                x="30"
                y="22"
                width="240"
                height="96"
            />
        </svg>
    );
}

export { PRESENTATION_STYLES };
