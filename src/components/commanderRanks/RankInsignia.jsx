import { getRankDefinition, resolveRankOrientation } from './rankCatalog';
import { resolveSiteImageUrl } from '../../utils/assetUrl';

function CivilianIdentity() {
    return (
        <g data-mark="civilian-identity" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <rect x="86" y="23" width="68" height="50" rx="8" strokeWidth="4" />
            <circle cx="106" cy="43" r="8" strokeWidth="3" />
            <path d="M94 63 C97 53 115 53 118 63 M128 39 H145 M128 49 H145 M128 59 H140" strokeWidth="3" />
            <path d="M111 23 V17 H129 V23" strokeWidth="4" />
        </g>
    );
}

export default function RankInsignia({ rank, orientation = 'native', rotation = 0, mirrored = false, color = 'currentColor', detailColor = '#f8ead0', className = '', style, ...svgProps }) {
    const definition = getRankDefinition(rank);
    const resolvedOrientation = resolveRankOrientation(rank, orientation);
    const orientationTurns = definition.orientation === resolvedOrientation ? 0 : 1;
    const normalizedRotation = ((Math.round(Number(rotation) / 90) * 90) % 360 + 360) % 360;
    const totalTurns = (orientationTurns + normalizedRotation / 90) % 4;
    const swapsAxes = totalTurns % 2 === 1;
    const assetLayout = definition.orientation === 'portrait' && swapsAxes
        ? { x: 72, y: -72, width: 96, height: 240 }
        : swapsAxes
            ? { x: 72, y: 28.8, width: 96, height: 38.4 }
            : { x: 0, y: 0, width: 240, height: 96 };
    const rotationTransform = totalTurns ? `rotate(${totalTurns * 90} 120 48)` : undefined;

    return (
        <svg
            viewBox="0 0 240 96"
            preserveAspectRatio="xMidYMid meet"
            className={className}
            style={{ color, '--rank-detail': detailColor, ...style }}
            role="img"
            aria-label={definition.ariaLabel}
            data-rank={rank}
            data-rank-family={definition.family}
            data-rank-renderer={definition.renderer}
            data-rank-orientation={resolvedOrientation}
            data-rank-rotation={normalizedRotation}
            data-rank-mirrored={mirrored ? 'true' : 'false'}
            xmlns="http://www.w3.org/2000/svg"
            {...svgProps}
        >
            {definition.renderer === 'none' && <g data-empty-insignia="true" />}
            {definition.renderer === 'civilian' && (
                <g transform={mirrored ? 'translate(240 0) scale(-1 1)' : undefined}>
                    <g transform={`translate(120 48) scale(${swapsAxes ? 0.4 : 1}) rotate(${totalTurns * 90}) translate(-120 -48)`}>
                    <CivilianIdentity />
                    </g>
                </g>
            )}
            {definition.asset && (
                <g data-rank-mirror-transform={mirrored ? 'true' : 'false'} transform={mirrored ? 'translate(240 0) scale(-1 1)' : undefined}>
                    <image
                        href={resolveSiteImageUrl(`/images/idf-ranks/${definition.asset}`)}
                        x={assetLayout.x}
                        y={assetLayout.y}
                        width={assetLayout.width}
                        height={assetLayout.height}
                        transform={rotationTransform}
                        preserveAspectRatio="xMidYMid meet"
                        data-rank-asset={definition.asset}
                        data-rank-rotated={totalTurns ? 'true' : 'false'}
                    />
                </g>
            )}
        </svg>
    );
}
