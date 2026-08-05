import React, { useState } from 'react';
import { DynamicIcon } from './DynamicIcon';
import { useResolvedSiteImageUrl } from './ResolvedSiteImage';

export default function NavVisual({
    item = null,
    icon,
    iconUrl,
    size = 18,
    className = '',
    imageClassName = '',
    fallbackIcon = 'HelpCircle',
}) {
    const [imageFailed, setImageFailed] = useState(false);
    const rawImageUrl = iconUrl || item?.iconUrl || item?.imageUrl || item?.image || '';
    const { source: resolvedImageUrl } = useResolvedSiteImageUrl(rawImageUrl);

    if (resolvedImageUrl && !imageFailed) {
        return (
            <img
                src={resolvedImageUrl}
                alt=""
                className={`object-contain ${imageClassName || className}`}
                style={imageClassName ? undefined : { width: size, height: size }}
                onError={() => setImageFailed(true)}
            />
        );
    }

    return <DynamicIcon name={icon || item?.icon || fallbackIcon} size={size} className={className} />;
}
