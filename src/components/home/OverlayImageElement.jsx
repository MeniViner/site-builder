import { panelStyle } from '../../utils/borderStyles';
import { getOverlayStyle, normalizeOverlayImageConfig } from '../../utils/overlayImageConfig';
import { resolveSiteImageUrl } from '../../utils/assetUrl';

export default function OverlayImageElement({ overlayImage, isPreview = false }) {
  const normalized = normalizeOverlayImageConfig(overlayImage);
  if (!normalized.enabled || !normalized.imageUrl) return null;

  const hasBorder = normalized.borderStyle !== 'none';
  const frameStyle = hasBorder ? panelStyle(normalized.borderStyle, 16) : undefined;
  const overlayStyle = getOverlayStyle(normalized, isPreview);

  return (
    <div
      className="pointer-events-none select-none"
      style={overlayStyle}
      aria-hidden="true"
    >
      <div
        className={`w-full h-full overflow-hidden ${hasBorder ? 'border border-theme-strong bg-theme-card/30 backdrop-blur-[1px]' : ''}`}
        style={frameStyle}
      >
        <img
          src={resolveSiteImageUrl(normalized.imageUrl)}
          alt=""
          className="w-full h-full"
          style={{ objectFit: normalized.objectFit }}
          draggable={false}
        />
      </div>
    </div>
  );
}
