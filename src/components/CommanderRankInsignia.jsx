import RankPresentation from './commanderRanks/RankPresentation';
import { getCommanderRankBackdropColorHex } from '../utils/commanderImage';

export default function CommanderRankInsignia({ rank, styleId = 'formal', orientation = 'native', rotation = 0, mirrored = false, backdropColor = '', className = '', style }) {
    return (
        <RankPresentation
            rank={rank}
            styleId={styleId}
            orientation={orientation}
            rotation={rotation}
            mirrored={mirrored}
            backgroundColor={getCommanderRankBackdropColorHex(backdropColor)}
            className={className}
            style={style}
        />
    );
}