import React from 'react';
import * as Icons from 'lucide-react';

export const DynamicIcon = ({ name, ...props }) => {
    if (!name) return null;
    // Look up the icon in the lucide-react exports
    const IconComponent = Icons[name];

    if (!IconComponent) {
        // Fallback if icon name doesn't exist
        return <Icons.HelpCircle {...props} />;
    }

    return <IconComponent {...props} />;
};
