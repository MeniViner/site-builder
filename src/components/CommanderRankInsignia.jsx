import RankPresentation from './commanderRanks/RankPresentation';

export default function CommanderRankInsignia({ rank, styleId = 'formal', orientation = 'native', rotation = 0, mirrored = false, className = '', style }) {
    return <RankPresentation rank={rank} styleId={styleId} orientation={orientation} rotation={rotation} mirrored={mirrored} className={className} style={style} />;
}