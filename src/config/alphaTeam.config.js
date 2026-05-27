export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.14';

export const ALPHA_TEAM_CONFIG = {
    nameHe: import.meta.env.VITE_ALPHA_TEAM_NAME_HE || 'צוות אלפא',
    nameEn: import.meta.env.VITE_ALPHA_TEAM_NAME_EN || 'Alpha Team',
    logoPath: import.meta.env.VITE_ALPHA_TEAM_LOGO_PATH || '/images/alphalogo1.png',
    email: import.meta.env.VITE_ALPHA_TEAM_EMAIL || 'r0023teamalpa@gmail.com',
    siteUrl: import.meta.env.VITE_ALPHA_TEAM_SITE_URL || 'portal.army.idf/sites/alphateam/siteDB/dist/index.html',
};

const normalizePublicUrl = (url) => {
    const trimmed = url?.trim?.() || '';
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
};

export const getAlphaTeamLinks = () => {
    const links = [];
    const email = ALPHA_TEAM_CONFIG.email?.trim?.() || '';
    const siteHref = normalizePublicUrl(ALPHA_TEAM_CONFIG.siteUrl);

    if (email) {
        links.push({
            key: 'email',
            label: 'מייל',
            href: `mailto:${email}`,
        });
    }
    if (siteHref) {
        links.push({
            key: 'site',
            label: 'לאתר שלנו',
            href: siteHref,
        });
    }
    return links;
};
