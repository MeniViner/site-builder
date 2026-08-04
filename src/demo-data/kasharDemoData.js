import { DEFAULT_CONFIG_V1, validateAndNormalize } from '../config/AppSchema';

function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
    }
    return value;
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

const demoNavigationItems = [
    {
        id: 'kashar-home',
        label: 'ראשי',
        kind: 'folder',
        icon: 'Home',
        url: '',
        children: [
            { id: 'kashar-home-access', label: 'בקשת הרשאה', kind: 'link', icon: 'KeyRound', url: '#', children: [] },
            { id: 'kashar-home-site', label: 'פתיחת אתר יחידתי', kind: 'link', icon: 'FolderPlus', url: '#', children: [] },
            { id: 'kashar-home-support', label: 'דיווח על תקלה', kind: 'link', icon: 'Wrench', url: '#', children: [] },
            { id: 'kashar-home-training', label: 'הרשמה להכשרה', kind: 'link', icon: 'GraduationCap', url: '#', children: [] },
            { id: 'kashar-home-documents', label: 'איתור מסמך מקצועי', kind: 'link', icon: 'Search', url: '#', children: [] },
            { id: 'kashar-home-helpdesk', label: 'פנייה למוקד השירות', kind: 'link', icon: 'Headphones', url: '#', children: [] },
        ],
    },
    {
        id: 'kashar-knowledge',
        label: 'מרכז הידע',
        kind: 'folder',
        icon: 'BookOpen',
        url: '',
        children: [
            { id: 'kashar-knowledge-guides', label: 'מדריכים מקצועיים', kind: 'link', icon: 'BookMarked', url: '#', children: [] },
            { id: 'kashar-knowledge-library', label: 'ספריית תבניות', kind: 'link', icon: 'Files', url: '#', children: [] },
            { id: 'kashar-knowledge-faq', label: 'שאלות נפוצות', kind: 'link', icon: 'MessagesSquare', url: '#', children: [] },
        ],
    },
    {
        id: 'kashar-training',
        label: 'הכשרות וכשירות',
        kind: 'folder',
        icon: 'GraduationCap',
        url: '',
        children: [
            { id: 'kashar-training-catalog', label: 'קטלוג הכשרות', kind: 'link', icon: 'LibraryBig', url: '#', children: [] },
            { id: 'kashar-training-learning', label: 'מסלולי למידה', kind: 'link', icon: 'Route', url: '#', children: [] },
            { id: 'kashar-training-knowledge', label: 'חומרי עזר ללמידה', kind: 'link', icon: 'NotebookTabs', url: '#', children: [] },
        ],
    },
    {
        id: 'kashar-services',
        label: 'שירותים ובקשות',
        kind: 'folder',
        icon: 'Handshake',
        url: '',
        children: [
            { id: 'kashar-services-access', label: 'בקשת הרשאה', kind: 'link', icon: 'KeyRound', url: '#', children: [] },
            { id: 'kashar-services-site', label: 'פתיחת אתר יחידתי', kind: 'link', icon: 'FolderPlus', url: '#', children: [] },
            { id: 'kashar-services-support', label: 'דיווח על תקלה', kind: 'link', icon: 'Wrench', url: '#', children: [] },
            { id: 'kashar-services-training', label: 'הרשמה להכשרה', kind: 'link', icon: 'GraduationCap', url: '#', children: [] },
            { id: 'kashar-services-document', label: 'איתור מסמך מקצועי', kind: 'link', icon: 'Search', url: '#', children: [] },
            { id: 'kashar-services-helpdesk', label: 'פנייה למוקד השירות', kind: 'link', icon: 'Headphones', url: '#', children: [] },
        ],
    },
    {
        id: 'kashar-updates',
        label: 'עדכונים',
        kind: 'folder',
        icon: 'Newspaper',
        url: '',
        children: [
            { id: 'kashar-updates-featured', label: 'עדכון נבחר – הדגמה', kind: 'link', icon: 'Sparkles', url: '#', children: [] },
            { id: 'kashar-updates-events', label: 'אירועים מקצועיים – הדגמה', kind: 'link', icon: 'CalendarDays', url: '#', children: [] },
        ],
    },
    {
        id: 'kashar-about',
        label: 'אודות',
        kind: 'folder',
        icon: 'Info',
        url: '',
        children: [
            { id: 'kashar-about-portal', label: 'אודות פורטל קשר״ר', kind: 'link', icon: 'CircleHelp', url: '#', children: [] },
            { id: 'kashar-about-demo', label: 'תוכן הדגמה בלבד', kind: 'link', icon: 'ShieldCheck', url: '#', children: [] },
        ],
    },
];

const kasharDemoConfigSource = {
    ...clone(DEFAULT_CONFIG_V1),
    meta: {
        appId: 'siteBuilder',
        migratedFromLegacy: false,
        lastUpdatedAt: null,
        lastUpdatedBy: null,
    },
    theme: {
        ...clone(DEFAULT_CONFIG_V1.theme),
        primaryColor: '#0f766e',
        displayMode: 'user-toggle',
        borderStyle: 'standard',
        backgrounds: {
            tinted: { enabled: true, strength: 64 },
            hero: { grayscale: false, glassEffect: true, glassStrength: 50 },
            navbar: { glassEffect: true, glassStrength: 54 },
        },
    },
    layout: {
        navigation: { showCategories: true, mode: 'grid' },
        hero: {
            widgetHeight: 'medium',
            panelsBordered: true,
            commanderPanelBordered: true,
            widgetPanelBordered: true,
        },
        externalLinks: { mode: 'cards', fixed: false, bordered: true, showBackground: true },
    },
    navigation: {
        items: demoNavigationItems,
    },
    content: {
        hero: {
            siteName: 'פורטל קשר״ר',
            title: 'מחברים בין אנשים, ידע ויכולת מבצעית',
            subtitle: 'מרחב מקצועי ללמידה, שירותים ועדכונים',
            logoUrl: '/images/gift.svg',
            description: 'פורטל הדגמה מקצועי המרכז ידע, הכשרות, כשירות, שירותים דיגיטליים ועדכונים. כל התכנים בדויים ומיועדים להצגה בלבד.',
            backgroundImageUrls: ['/images/לח7.jpg'],
        },
        commander: {
            imageUrl: '',
            sectionTitle: 'ברוכים הבאים לפורטל קשר״ר',
            roleLabel: 'מרחב מקצועי – תוכן הדגמה בלבד',
            decorativeElement: 'line-diamond-line',
            messages: [
                {
                    id: 'kashar-welcome',
                    text: 'הפורטל מדגים חיבור פשוט בין ידע מקצועי, מסלולי למידה ושירותים דיגיטליים – ללא מידע אישי, מבצעי או עדכני.',
                    signature: 'צוות פורטל קשר״ר | הדגמה',
                },
            ],
        },
        overlayImage: {
            ...clone(DEFAULT_CONFIG_V1.content.overlayImage),
            enabled: false,
            imageUrl: '',
        },
        orgChart: {
            ...clone(DEFAULT_CONFIG_V1.content.orgChart),
            enabled: false,
            pageTitle: 'מבנה מקצועי – הדגמה',
            nodes: [],
            nodePositions: {},
        },
    },
    widgets: {
        active: ['news', 'events', 'tips'],
        carousel: { rotationIntervalSeconds: 8 },
        display: clone(DEFAULT_CONFIG_V1.widgets.display),
        data: {
            events: {
                displayCount: 3,
                displayMode: 'default',
                intervalMs: 6000,
                items: [
                    { id: 'kashar-event-knowledge', date: '2030-01-12', title: 'מפגש ידע מקצועי – הדגמה', subtitle: 'תוכן לדוגמה בלבד', color: 'gray' },
                    { id: 'kashar-event-training', date: '2030-02-08', title: 'סדנת למידה דיגיטלית – הדגמה', subtitle: 'תוכן לדוגמה בלבד', color: 'gray' },
                    { id: 'kashar-event-services', date: '2030-03-19', title: 'היכרות עם שירותים דיגיטליים – הדגמה', subtitle: 'תוכן לדוגמה בלבד', color: 'gray' },
                ],
            },
            alerts: { items: [] },
            outstanding: { items: [] },
            countdown: {
                title: '',
                targetDate: '',
                showDetails: false,
                details: '',
                switchIntervalSeconds: 8,
                activeItemId: null,
                items: [],
            },
            news: {
                items: [
                    {
                        id: 'kashar-news-featured',
                        text: 'עדכון נבחר – הדגמה: מרכז הידע כולל מסלולי למידה, תבניות ושירותים לדוגמה.',
                        isUrgent: false,
                    },
                    {
                        id: 'kashar-news-services',
                        text: 'שירותים ובקשות מוצגים כאן כדוגמה לחוויית שירות אחידה.',
                        isUrgent: false,
                    },
                ],
            },
            phonebook: { items: [] },
            shuttles: { items: [] },
            polls: { activePollId: null, items: [] },
            celebrations: { items: [] },
            heritage: { items: [] },
            tips: {
                items: [
                    {
                        id: 'kashar-tip-knowledge',
                        title: 'פריט ידע מקצועי',
                        text: 'הדגמה: התחילו מחיפוש ממוקד, שמרו תבניות שימושיות וחזרו אליהן בעת הצורך.',
                    },
                    {
                        id: 'kashar-tip-training',
                        title: 'למידה רציפה',
                        text: 'הדגמה: חלקו נושא מקצועי לצעדים קצרים ותעדו את נקודות המפתח.',
                    },
                ],
            },
        },
    },
    externalLinks: {
        items: [
            { id: 'kashar-footer-knowledge', title: 'מרכז הידע', url: '#', visual: { type: 'icon', icon: 'BookOpen' }, order: 0 },
            { id: 'kashar-footer-training', title: 'הכשרות וכשירות', url: '#', visual: { type: 'icon', icon: 'GraduationCap' }, order: 1 },
            { id: 'kashar-footer-services', title: 'שירותים דיגיטליים', url: '#', visual: { type: 'icon', icon: 'Handshake' }, order: 2 },
            { id: 'kashar-footer-disclaimer', title: 'תוכן הדגמה בלבד', url: '#', visual: { type: 'icon', icon: 'Info' }, order: 3 },
        ],
    },
    imageGalleries: {
        schemaVersion: 1,
        items: [],
    },
    access: {
        adminUsers: [],
    },
};

/**
 * The complete schema-v1 master configuration used by the Kashar Vite profile.
 * It is frozen and callers must use a clone before allowing edits in memory.
 */
export const kasharDemoData = deepFreeze(validateAndNormalize(kasharDemoConfigSource));

export function cloneKasharDemoData() {
    return clone(kasharDemoData);
}

/**
 * Legacy WidgetService still owns the shared poll response. This provides its
 * compatible response without creating a separate demo content model.
 */
export function createKasharDemoWidgetConfig() {
    const widgets = cloneKasharDemoData().widgets;
    const data = widgets.data;
    const activePollId = data.polls.activePollId;

    return {
        activeWidgets: widgets.active,
        rotationInterval: widgets.carousel.rotationIntervalSeconds,
        widgetSettings: widgets.display,
        outstanding: data.outstanding.items,
        countdown: data.countdown,
        news: data.news.items,
        phonebook: data.phonebook.items,
        shuttles: data.shuttles.items,
        polls: data.polls.items.map((poll) => ({
            ...poll,
            active: activePollId !== null && String(activePollId) === String(poll.id),
        })),
        celebrations: data.celebrations.items,
        heritage: data.heritage.items,
        tips: data.tips.items,
    };
}
