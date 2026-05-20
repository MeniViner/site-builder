export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.14';

export const ALPHA_TEAM_CONFIG = {
    nameHe: import.meta.env.VITE_ALPHA_TEAM_NAME_HE || 'צוות אלפא',
    nameEn: import.meta.env.VITE_ALPHA_TEAM_NAME_EN || 'Alpha Team',
    logoPath: import.meta.env.VITE_ALPHA_TEAM_LOGO_PATH || '/images/alphalogo1.png',
    email: import.meta.env.VITE_ALPHA_TEAM_EMAIL || '',
    siteUrl: import.meta.env.VITE_ALPHA_TEAM_SITE_URL || '',
};

export const getAlphaTeamLinks = () => {
    const links = [];
    if (ALPHA_TEAM_CONFIG.email) {
        links.push({
            key: 'email',
            label: ALPHA_TEAM_CONFIG.nameHe,
            href: `mailto:${ALPHA_TEAM_CONFIG.email}`,
        });
    }
    if (/^https?:\/\//i.test(ALPHA_TEAM_CONFIG.siteUrl)) {
        links.push({
            key: 'site',
            label: 'אתר',
            href: ALPHA_TEAM_CONFIG.siteUrl,
        });
    }
    return links;
};
