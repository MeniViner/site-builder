import { DEFAULT_CONFIG_V1, validateAndNormalize } from '../config/AppSchema';
import { normalizeGanttData } from '../utils/ganttData';
import { createBoomDemoData, normalizeBoomData } from '../utils/boomData';

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

function folder(id, label, icon, children) {
    return { id, label, kind: 'folder', icon, url: '', children };
}

function link(id, label, icon, url = '#') {
    return { id, label, kind: 'link', icon, url, children: [] };
}

const networkKnowledgeFolder = {
    id: 'kashar-knowledge-repository',
    label: 'מאגר תו״ל, הדרכה וידע מקצועי',
    // The model preserves the target; the navigation normalizer represents link kinds as `link`.
    kind: 'network-folder',
    icon: 'FolderOpen',
    url: '\\\\KASHAR-DEMO\\Shared\\Professional-Knowledge',
    children: [],
};

const demoNavigationItems = [
    folder('kashar-management', 'מטה וניהול', 'Building2', [
        folder('kashar-management-planning', 'תכנון ובקרה', 'Target', [
            link('kashar-management-annual-plan', 'תכנית עבודה שנתית', 'CalendarDays'),
            link('kashar-management-decisions', 'מעקב החלטות', 'ClipboardCheck'),
            link('kashar-management-status', 'תמונת מצב משימות', 'LayoutDashboard'),
            link('kashar-management-gantt', 'גאנט פעילות', 'ChartNoAxesCombined'),
        ]),
        folder('kashar-management-documents', 'מסמכים ותיקיות', 'Folder', [
            networkKnowledgeFolder,
            link('kashar-management-templates', 'תבניות ומסמכי עבודה', 'Files'),
            link('kashar-management-archive', 'ארכיון סיכומים', 'Archive'),
        ]),
        folder('kashar-management-services', 'שירותים והרשאות', 'UserCheck', [
            link('kashar-management-access', 'בקשת הרשאה', 'Key'),
            link('kashar-management-unit-site', 'פתיחת אתר יחידתי', 'FolderPlus'),
            link('kashar-management-helpdesk', 'פנייה למוקד השירות', 'Headset'),
        ]),
    ]),
    folder('kashar-force', 'הפעלת כוח', 'Network', [
        folder('kashar-force-status', 'תמונת מצב', 'Monitor', [
            link('kashar-force-task-board', 'לוח משימות', 'ClipboardList'),
            link('kashar-force-reports', 'דיווחים ועדכונים', 'FileText'),
            link('kashar-force-readiness', 'מעקב מוכנות', 'BarChart3'),
        ]),
        folder('kashar-force-network', 'רשת וספקטרום', 'RadioTower', [
            link('kashar-force-network-links', 'ניהול קישורי רשת', 'Network'),
            link('kashar-force-infrastructure', 'מאגר תשתיות', 'Database'),
            link('kashar-force-monitoring', 'כלי ניטור ותמיכה', 'Wrench'),
        ]),
        folder('kashar-force-tools', 'כלי עבודה', 'Wrench', [
            link('kashar-force-forms', 'טפסים נפוצים', 'FileText'),
            link('kashar-force-reports-library', 'דוחות', 'FileSpreadsheet'),
            link('kashar-force-professional-systems', 'מערכות מקצועיות', 'Monitor'),
        ]),
    ]),
    folder('kashar-professionalism', 'בניין כוח ומקצועיות', 'GraduationCap', [
        folder('kashar-professionalism-training', 'הכשרות וכשירות', 'GraduationCap', [
            link('kashar-professionalism-training-plan', 'תכנית הכשרות', 'CalendarCheck'),
            link('kashar-professionalism-training-enrollment', 'רישום להכשרה', 'UserCheck'),
            link('kashar-professionalism-training-certification', 'מעקב הסמכות', 'Award'),
        ]),
        folder('kashar-professionalism-knowledge', 'תורה וידע', 'BookOpen', [
            link('kashar-professionalism-knowledge-center', 'מרכז הידע', 'BookOpen'),
            link('kashar-professionalism-guides', 'מדריכים מקצועיים', 'BookMarked'),
            link('kashar-professionalism-lessons', 'הפקת לקחים', 'ClipboardList'),
        ]),
        folder('kashar-professionalism-people', 'אנשים ומורשת', 'Users', [
            link('kashar-professionalism-org-tree', 'עץ ארגוני', 'Users'),
            link('kashar-professionalism-commander', 'דבר המפקד', 'MessageCircle'),
            link('kashar-professionalism-heritage', 'מורשת חיל הקשר והתקשוב', 'Landmark'),
        ]),
    ]),
];

const galleryImages = [
    ['kashar-gallery-scene-01', '/images/לח7.jpg', 'אווירת פעילות מקצועית – הדגמה', 1284, 723, 'image/jpeg'],
    ['kashar-gallery-scene-02', '/images/לח3.jpg', 'למידה ועבודה בצוות – הדגמה', 1600, 1200, 'image/jpeg'],
    ['kashar-gallery-scene-03', '/images/לח1.jpeg', 'מרחב דיגיטלי ומקצועי – הדגמה', 300, 168, 'image/jpeg'],
    ['kashar-gallery-scene-04', '/images/לח4.webp', 'מקצועיות, הכשרה ומוכנות – הדגמה', 1600, 1066, 'image/webp'],
    ['kashar-gallery-scene-05', '/images/לח2.jpeg', 'שיתוף פעולה – הדגמה', 192, 108, 'image/jpeg'],
    ['kashar-gallery-scene-06', '/images/לח6.webp', 'סביבת למידה – הדגמה', 1024, 847, 'image/webp'],
    ['kashar-gallery-scene-07', '/images/idf-tank_enhanced.png', 'תמונת מורשת מאושרת במאגר – הדגמה', 2640, 1760, 'image/png'],
    ['kashar-gallery-scene-08', '/images/IDFsoldiers.jpeg', 'אנשים ויכולת מקצועית – הדגמה', 3200, 2056, 'image/jpeg'],
    ['kashar-gallery-scene-09', '/images/לח5.jpeg', 'טכנולוגיה בשירות האנשים – הדגמה', 1600, 1066, 'image/jpeg'],
];

function toGalleryImage([id, mediaRef, alt, width, height, mimeType]) {
    return {
        id,
        mediaRef,
        alt,
        caption: 'תוכן הדגמה בלבד',
        width,
        height,
        media: {
            fileName: mediaRef.split('/').pop(),
            mimeType,
            sizeBytes: 0,
        },
    };
}

/**
 * Single, reviewable source for all presentation-ready Kashar values.
 * Any real unit content can be replaced here without changing app behavior.
 */
export const kasharFinalData = deepFreeze({
    organization: {
        displayName: 'קשר״ר וחטיבת ההפעלה',
        shortName: 'קשר״ר',
        portalSubtitle: 'פורטל הידע, הניהול והשירותים',
        heroTitle: 'מחברים בין אנשים, ידע ויכולת מבצעית',
        supportingCopy: 'סביבה מקצועית לידע, הכשרות, מוכנות, ניהול ושירותים דיגיטליים.',
        demoDisclaimer: 'תוכן הדגמה בלבד',
        replacementNotice: 'מבנה ותוכן להמחשה – נתונים סופיים יוזנו על ידי היחידה.',
    },
    assets: {
        emblem: {
            localPath: '/images/kashar-demo/idf-communications-corps-emblem.svg',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:IDF_Communications_Corps.svg',
            sourceType: 'IDF-released emblem via Wikimedia Commons',
        },
        commanderPortrait: {
            localPath: '',
            sourceUrl: 'https://www.idf.il/%D7%90%D7%AA%D7%A8%D7%99-%D7%99%D7%97%D7%99%D7%93%D7%95%D7%AA/%D7%90%D7%92%D7%A3-%D7%94%D7%AA%D7%A7%D7%A9%D7%95%D7%91-%D7%95%D7%94%D7%94%D7%92%D7%A0%D7%94-%D7%91%D7%A1%D7%99%D7%99%D7%91%D7%A8/%D7%9B%D7%9C-%D7%94%D7%9B%D7%AA%D7%91%D7%95%D7%AA/2024/%D7%9E%D7%A4%D7%A7%D7%93-%D7%97%D7%93%D7%A9-%D7%9C%D7%97%D7%99%D7%9C-%D7%94%D7%A7%D7%A9%D7%A8-%D7%95%D7%94%D7%AA%D7%A7%D7%A9%D7%95%D7%91/',
            sourceType: 'Official IDF announcement; image download blocked by source anti-bot response',
        },
    },
    navigation: demoNavigationItems,
    orgChart: {
        pageTitle: 'עץ ארגוני – קשר״ר וחטיבת ההפעלה',
        nodes: [
            {
                id: 'kashar-org-root',
                name: 'קשר״ר וחטיבת ההפעלה',
                rank: 'מבנה להמחשה',
                role: 'מטה מקצועי ושירותים',
                imageUrl: '/images/kashar-demo/idf-communications-corps-emblem.svg',
                children: [
                    {
                        id: 'kashar-org-headquarters', name: 'מטה ותכנון', rank: '', role: 'תכנון, בקרה ושירות', imageUrl: '', children: [
                            { id: 'kashar-org-planning-control', name: 'תכנון ובקרה', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                            { id: 'kashar-org-resources-service', name: 'משאבים ושירות', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                        ],
                    },
                    {
                        id: 'kashar-org-force-operation', name: 'הפעלת כוח', rank: '', role: 'תמונת מצב ותשתיות', imageUrl: '', children: [
                            { id: 'kashar-org-ground-c4i', name: 'תקשוב יבשה', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                            { id: 'kashar-org-systemic-coordination', name: 'תיאום מערכתי', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                        ],
                    },
                    {
                        id: 'kashar-org-professional-readiness', name: 'מקצועיות וכשירות', rank: '', role: 'ידע, למידה ומוכנות', imageUrl: '', children: [
                            { id: 'kashar-org-training', name: 'הכשרות', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                            { id: 'kashar-org-doctrine-knowledge', name: 'תורה וידע', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                        ],
                    },
                    {
                        id: 'kashar-org-people-heritage', name: 'אנשים ומורשת', rank: '', role: 'אנשים, זיכרון ושייכות', imageUrl: '', children: [
                            { id: 'kashar-org-hr', name: 'משאבי אנוש', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                            { id: 'kashar-org-heritage-commemoration', name: 'מורשת והנצחה', rank: '', role: 'תחום להמחשה', imageUrl: '', children: [] },
                        ],
                    },
                ],
            },
        ],
    },
});

const kasharDemoConfigSource = {
    ...clone(DEFAULT_CONFIG_V1),
    meta: { appId: 'siteBuilder', migratedFromLegacy: false, lastUpdatedAt: null, lastUpdatedBy: null },
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
        hero: { widgetHeight: 'medium', panelsBordered: true, commanderPanelBordered: true, widgetPanelBordered: true },
        externalLinks: { mode: 'cards', fixed: false, bordered: true, showBackground: true },
    },
    navigation: { items: clone(kasharFinalData.navigation) },
    content: {
        hero: {
            siteName: kasharFinalData.organization.displayName,
            title: kasharFinalData.organization.heroTitle,
            subtitle: kasharFinalData.organization.portalSubtitle,
            logoUrl: kasharFinalData.assets.emblem.localPath,
            description: `${kasharFinalData.organization.supportingCopy} ${kasharFinalData.organization.demoDisclaimer}. ${kasharFinalData.organization.replacementNotice}`,
            backgroundImageUrls: ['/images/לח7.jpg', '/images/לח4.webp', '/images/IDFsoldiers.jpeg'],
        },
        commander: {
            // Intentionally blank until the official source can supply bytes; never show a different person.
            imageUrl: kasharFinalData.assets.commanderPortrait.localPath,
            sectionTitle: 'תא״ל עומר כהן',
            roleLabel: 'קצין הקשר והתקשוב הראשי וראש חטיבת ההפעלה',
            decorativeElement: 'line-diamond-line',
            messages: [{
                id: 'kashar-commander-welcome',
                text: 'הפורטל מציג סביבת הדגמה המחברת בין אנשים, ידע, הכשרות ושירותים דיגיטליים. אין בו מידע אישי, מבצעי או עדכני.',
                signature: 'קשר״ר וחטיבת ההפעלה | תוכן הדגמה בלבד',
            }],
        },
        overlayImage: { ...clone(DEFAULT_CONFIG_V1.content.overlayImage), enabled: false, imageUrl: '' },
        orgChart: {
            ...clone(DEFAULT_CONFIG_V1.content.orgChart),
            enabled: true,
            pageTitle: kasharFinalData.orgChart.pageTitle,
            layoutDirection: 'flow-canvas',
            cardStyle: 'horizontal',
            lineStyle: 'solid',
            avatarShape: 'rounded',
            flowCanvas: {
                ...clone(DEFAULT_CONFIG_V1.content.orgChart.flowCanvas),
                edgeType: 'smoothstep',
                edgeAnimated: true,
                backgroundVariant: 'dots',
                showMiniMap: true,
                showControls: true,
                nodeVisualStyle: 'command',
                autoLayoutDirection: 'rtl',
            },
            nodes: clone(kasharFinalData.orgChart.nodes),
            nodePositions: {},
        },
    },
    widgets: {
        active: ['news', 'events', 'heritage'],
        carousel: { rotationIntervalSeconds: 8 },
        display: clone(DEFAULT_CONFIG_V1.widgets.display),
        data: {
            events: {
                displayCount: 3,
                displayMode: 'default',
                intervalMs: 6000,
                items: [
                    { id: 'kashar-event-knowledge', date: '2026-09-10', title: 'מפגש ידע מקצועי – הדגמה', subtitle: 'תוכן, תבניות ונהלי עבודה לדוגמה בלבד', color: 'gray' },
                    { id: 'kashar-event-training', date: '2026-10-14', title: 'סדנת למידה דיגיטלית – הדגמה', subtitle: 'מסלול הכשרה מדומה ללא רישום אמיתי', color: 'gray' },
                    { id: 'kashar-event-services', date: '2026-11-05', title: 'היכרות עם שירותים דיגיטליים – הדגמה', subtitle: 'תצוגת שירותים לצורכי מצגת בלבד', color: 'gray' },
                ],
            },
            alerts: { items: [] },
            outstanding: { items: [] },
            countdown: { title: '', targetDate: '', showDetails: false, details: '', switchIntervalSeconds: 8, activeItemId: null, items: [] },
            news: {
                items: [
                    { id: 'kashar-news-portal', text: 'עדכון נבחר – הדגמה: מרכז הידע מאגד מסלולי למידה, תבניות ושירותים במבנה אחיד.', isUrgent: false },
                    { id: 'kashar-news-disclaimer', text: 'תוכן הדגמה בלבד: מבנה ותוכן סופיים יוזנו על ידי היחידה.', isUrgent: false },
                ],
            },
            phonebook: { items: [] },
            shuttles: { items: [] },
            polls: { activePollId: null, items: [] },
            celebrations: { items: [] },
            heritage: {
                items: [
                    { id: 'kashar-heritage-connection', quote: 'מחברים בין אנשים, ידע ויכולת מבצעית.', author: 'קשר״ר וחטיבת ההפעלה', role: 'מורשת להמחשה' },
                    { id: 'kashar-heritage-professionalism', quote: 'למידה משותפת ושירות מקצועי הם חלק מחוויית עבודה טובה.', author: 'פורטל ההדגמה', role: 'תוכן לדוגמה בלבד' },
                ],
            },
            tips: {
                items: [
                    { id: 'kashar-tip-knowledge', title: 'פריט ידע מקצועי', text: 'הדגמה: התחילו מחיפוש ממוקד, שמרו תבניות שימושיות וחזרו אליהן בעת הצורך.' },
                    { id: 'kashar-tip-training', title: 'למידה רציפה', text: 'הדגמה: חלקו נושא מקצועי לצעדים קצרים ותעדו את נקודות המפתח.' },
                ],
            },
        },
    },
    externalLinks: {
        items: [
            { id: 'kashar-footer-knowledge', title: 'מרכז הידע', url: '#', visual: { type: 'icon', icon: 'BookOpen' }, order: 0 },
            { id: 'kashar-footer-training', title: 'הכשרות וכשירות', url: '#', visual: { type: 'icon', icon: 'GraduationCap' }, order: 1 },
            { id: 'kashar-footer-services', title: 'שירותים דיגיטליים', url: '#', visual: { type: 'icon', icon: 'Handshake' }, order: 2 },
            { id: 'kashar-footer-org', title: 'עץ ארגוני – הדגמה', url: '#/org-chart', visual: { type: 'icon', icon: 'Users' }, order: 3 },
            { id: 'kashar-footer-gantt', title: 'גאנט עבודה – הדגמה', url: '#/gantt', visual: { type: 'icon', icon: 'ChartNoAxesCombined' }, order: 4 },
            { id: 'kashar-footer-disclaimer', title: 'תוכן הדגמה בלבד', url: '#', visual: { type: 'icon', icon: 'Info' }, order: 5 },
        ],
    },
    imageGalleries: {
        schemaVersion: 1,
        items: [
            {
                id: 'kashar-gallery-highlights',
                title: 'מקצועיות, הכשרה ומורשת',
                description: 'גלריית הדגמה המבוססת על נכסים קיימים במאגר הפרויקט.',
                active: true,
                style: 'classic-carousel',
                order: 0,
                images: galleryImages.slice(0, 4).map(toGalleryImage),
                display: { showTitle: true, showDescription: true, titleAlignment: 'right' },
            },
            {
                id: 'kashar-gallery-magal',
                title: 'רצועת פעילות וידע',
                description: 'רצועות תנועה להדגמה; עצירה זמינה דרך העדפת הפחתת תנועה של המשתמש.',
                active: true,
                style: 'magal-strips',
                order: 1,
                images: galleryImages.map(toGalleryImage),
                display: {
                    showTitle: true,
                    showDescription: true,
                    titleAlignment: 'right',
                    magalStrips: {
                        rowCount: 3,
                        cardSizePx: 180,
                        gapPx: 12,
                        rows: [
                            { id: 'row-1', direction: 'left', durationSeconds: 38, angleDegrees: 3 },
                            { id: 'row-2', direction: 'right', durationSeconds: 44, angleDegrees: -3 },
                            { id: 'row-3', direction: 'left', durationSeconds: 40, angleDegrees: 2 },
                            { id: 'row-4', direction: 'right', durationSeconds: 46, angleDegrees: -2 },
                        ],
                    },
                },
            },
        ],
    },
    access: { adminUsers: [] },
};

/** The specialist Gantt store draws its profile fixture from this same module. */
export const kasharDemoGanttData = deepFreeze(normalizeGanttData({
    enabled: true,
    buttonLabel: 'גאנט עבודה – הדגמה',
    pageTitle: 'תכנית עבודה שנתית – הדגמה',
    description: 'תכנית עבודה סינתטית להצגת תלות, אבני דרך ומסלולי עבודה. אין בה מידע תפעולי או עדכני.',
    groupBy: 'category',
    defaultView: 'quarter',
    showLegend: true,
    showToday: true,
    settings: {
        design: {
            presetId: 'glass-modern',
            layoutMode: 'fullWidth',
            chartWidthMode: 'full',
            chartHeightMode: 'viewport',
            density: 'comfortable',
            taskColumnWidth: 'wide',
            cardStyle: 'glass',
            backgroundStyle: 'glass',
            toolbarStyle: 'comfortable',
            gridStyle: 'subtle',
            barStyle: 'rounded',
            milestoneStyle: 'diamond',
            legendPlacement: 'bottom',
            todayLineStyle: 'soft',
            showOuterCard: true,
            barShadow: true,
            showProgressLabel: true,
            colors: { chartBackground: '#f8fafc', cardBackground: '#ffffff', accentColor: '#0f766e', todayLineColor: '#dc2626' },
        },
    },
    categories: [
        { id: 'kashar-gantt-management', name: 'מטה וניהול', color: '#2563eb', order: 1 },
        { id: 'kashar-gantt-operations', name: 'הפעלת כוח', color: '#0f766e', order: 2 },
        { id: 'kashar-gantt-readiness', name: 'מקצועיות וכשירות', color: '#7c3aed', order: 3 },
        { id: 'kashar-gantt-knowledge', name: 'תורה וידע', color: '#0891b2', order: 4 },
        { id: 'kashar-gantt-heritage', name: 'אנשים ומורשת', color: '#d97706', order: 5 },
    ],
    items: [
        {
            id: 'kashar-gantt-annual-plan', title: 'גיבוש תכנית עבודה שנתית – הדגמה', owner: 'מטה ותכנון', category: 'מטה וניהול', status: 'completed',
            startDate: '2026-01-12', endDate: '2026-03-12', color: '#2563eb', details: 'מסלול עבודה סינתטי לצורכי מצגת בלבד.', dependsOn: [],
            milestones: [{ id: 'kashar-ms-plan-outline', title: 'טיוטת תכנית', date: '2026-02-02' }, { id: 'kashar-ms-plan-ready', title: 'תכנית מוכנה להצגה', date: '2026-03-12' }],
        },
        {
            id: 'kashar-gantt-knowledge-hub', title: 'ארגון מרכז הידע – הדגמה', owner: 'תורה וידע', category: 'תורה וידע', status: 'planned',
            startDate: '2026-04-05', endDate: '2026-09-15', color: '#0891b2', details: 'מיון מבנה תוכן, תבניות וקישורים ללא תוכן פנימי.', dependsOn: ['kashar-gantt-annual-plan'],
            milestones: [{ id: 'kashar-ms-knowledge-map', title: 'מפת ידע לדוגמה', date: '2026-06-01' }, { id: 'kashar-ms-knowledge-review', title: 'סקירת מבנה', date: '2026-09-15' }],
        },
        {
            id: 'kashar-gantt-readiness-plan', title: 'תכנית הכשרות וכשירות – הדגמה', owner: 'מקצועיות וכשירות', category: 'מקצועיות וכשירות', status: 'planned',
            startDate: '2026-05-18', endDate: '2026-10-22', color: '#7c3aed', details: 'המחשת רצף הכשרות, הסמכות ומעקב בלבד.', dependsOn: ['kashar-gantt-annual-plan'],
            milestones: [{ id: 'kashar-ms-training-catalog', title: 'קטלוג הכשרות לדוגמה', date: '2026-07-08' }, { id: 'kashar-ms-training-review', title: 'בדיקת מוכנות מדומה', date: '2026-10-22' }],
        },
        {
            id: 'kashar-gantt-network-review', title: 'מיפוי שירותי רשת וספקטרום – הדגמה', owner: 'הפעלת כוח', category: 'הפעלת כוח', status: 'onHold',
            startDate: '2026-06-10', endDate: '2026-08-28', color: '#0f766e', details: 'דוגמה למסלול מושהה; לא מתאר רשת או תשתית אמיתית.', dependsOn: ['kashar-gantt-annual-plan'],
            milestones: [{ id: 'kashar-ms-network-template', title: 'תבנית מאגר תשתיות', date: '2026-07-02' }],
        },
        {
            id: 'kashar-gantt-services-catalog', title: 'איחוד שירותים והרשאות – הדגמה', owner: 'משאבים ושירות', category: 'מטה וניהול', status: 'planned',
            startDate: '2026-07-01', endDate: '2026-11-10', color: '#16a34a', details: 'הצגת מסלולי שירות ללא טפסים, הרשאות או יעדים אמיתיים.', dependsOn: ['kashar-gantt-knowledge-hub'],
            milestones: [{ id: 'kashar-ms-services-layout', title: 'מבנה שירותים', date: '2026-08-18' }, { id: 'kashar-ms-services-review', title: 'סקירת הדגמה', date: '2026-11-10' }],
        },
        {
            id: 'kashar-gantt-heritage-gallery', title: 'אצירת מורשת וגלריה – הדגמה', owner: 'אנשים ומורשת', category: 'אנשים ומורשת', status: 'planned',
            startDate: '2026-08-20', endDate: '2026-12-08', color: '#d97706', details: 'המחשת תהליך אצירה והצגת נכסים מאושרים בלבד.', dependsOn: ['kashar-gantt-knowledge-hub'],
            milestones: [{ id: 'kashar-ms-heritage-selection', title: 'בחירת נכסים', date: '2026-10-01' }, { id: 'kashar-ms-heritage-showcase', title: 'תצוגת מורשת', date: '2026-12-08' }],
        },
        {
            id: 'kashar-gantt-year-summary', title: 'סיכום שנתי – הדגמה', owner: 'מטה ותכנון', category: 'מטה וניהול', status: 'planned',
            startDate: '2026-11-20', endDate: '2026-12-28', color: '#475569', details: 'אבן סיום סינתטית התלויה במסלולי ההצגה הקודמים.', dependsOn: ['kashar-gantt-readiness-plan', 'kashar-gantt-services-catalog', 'kashar-gantt-heritage-gallery'],
            milestones: [{ id: 'kashar-ms-summary', title: 'סיכום שנתי', date: '2026-12-28' }],
        },
    ],
}));

/** Independent BOOM command-and-control fixture for the Kashar profile. */
export const kasharDemoBoomData = deepFreeze(normalizeBoomData({
    ...createBoomDemoData(),
    enabled: true,
    description: 'מעקב שליטה ובקרה אחר משימות מרכזיות.',
}));

/** The complete schema-v1 master configuration used by the Kashar Vite profile. */
export const kasharDemoData = deepFreeze(validateAndNormalize(kasharDemoConfigSource));

export function cloneKasharDemoData() {
    return clone(kasharDemoData);
}

export function cloneKasharDemoGanttData() {
    return clone(kasharDemoGanttData);
}

export function cloneKasharDemoBoomData() {
    return clone(kasharDemoBoomData);
}

/** Legacy WidgetService still owns the shared poll response. */
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
        polls: data.polls.items.map((poll) => ({ ...poll, active: activePollId !== null && String(activePollId) === String(poll.id) })),
        celebrations: data.celebrations.items,
        heritage: data.heritage.items,
        tips: data.tips.items,
    };
}
