import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildCanonicalLegacySeedTexts } from '../config/siteSeedDefaults';
import { ensureSharePointTextFileExists, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { spBootstrapLog } from '../utils/spAppLog';
import { resolveDefaultMasterConfigFileUrl } from './ConfigAdapter';

const buildBootstrapFileDefinitions = () => {
    const urlsByKey = {
        masterConfig: resolveDefaultMasterConfigFileUrl(),
        users: SHAREPOINT_CONFIG.usersFileServerRelativeUrl,
        events: SHAREPOINT_CONFIG.fileServerRelativeUrl,
        navigation: SHAREPOINT_CONFIG.navFileServerRelativeUrl,
        siteContent: SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl,
        theme: SHAREPOINT_CONFIG.themeFileServerRelativeUrl,
        widgets: SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl,
        externalLinks: SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl,
        gantt: SHAREPOINT_CONFIG.ganttFileServerRelativeUrl,
        boom: SHAREPOINT_CONFIG.boomFileServerRelativeUrl,
    };

    return buildCanonicalLegacySeedTexts()
        .map((file) => ({
            ...file,
            serverRelativeUrl: urlsByKey[file.key] || '',
            contentType: file.key === 'masterConfig' ? 'text/plain; charset=utf-8' : undefined,
        }))
        .filter((file) => typeof file.serverRelativeUrl === 'string' && file.serverRelativeUrl.trim().length > 0);
};

let bootstrapOncePromise = null;

export const ensureSharePointBootstrapFiles = async () => {
    if (SHAREPOINT_CONFIG.useMock) {
        return [];
    }

    if (bootstrapOncePromise) {
        return bootstrapOncePromise;
    }

    bootstrapOncePromise = (async () => {
        const files = buildBootstrapFileDefinitions();
        const summary = [];

        spBootstrapLog.info(`Bootstrap SharePoint: בודק/יוצר קבצי מערכת (${files.length})...`);

        for (const file of files) {
            try {
                const result = await ensureSharePointTextFileExists({
                    serverRelativeUrl: file.serverRelativeUrl,
                    text: file.text,
                    contentType: file.contentType || 'text/plain; charset=utf-8',
                });

                summary.push({
                    key: file.key,
                    created: result.created,
                    serverRelativeUrl: file.serverRelativeUrl,
                });

                if (result.created) {
                    spBootstrapLog.info(`Bootstrap: נוצר קובץ ${file.label}`);
                } else {
                    spBootstrapLog.info(`Bootstrap: קובץ כבר קיים ${file.label}`);
                }
            } catch (error) {
                summary.push({
                    key: file.key,
                    created: false,
                    serverRelativeUrl: file.serverRelativeUrl,
                    error: error?.message || String(error),
                });
                spBootstrapLog.warn(`Bootstrap: נכשל ביצירת ${file.label} (${file.serverRelativeUrl})`, error);
            }
        }

        return summary;
    })();

    return bootstrapOncePromise;
};

export const overwriteSharePointBootstrapFiles = async () => {
    if (SHAREPOINT_CONFIG.useMock) {
        return [];
    }

    const files = buildBootstrapFileDefinitions();
    const summary = [];

    spBootstrapLog.info(`Factory reset: מעדכן קבצי מערכת לברירות מחדל (${files.length})...`);

    for (const file of files) {
        try {
            const { response } = await upsertSharePointTextFile({
                serverRelativeUrl: file.serverRelativeUrl,
                text: file.text,
                contentType: file.contentType || 'text/plain; charset=utf-8',
            });

            const ok = Boolean(response?.ok);
            summary.push({
                key: file.key,
                ok,
                status: response?.status ?? null,
                serverRelativeUrl: file.serverRelativeUrl,
            });

            if (ok) {
                spBootstrapLog.info(`Factory reset: עודכן קובץ ${file.label}`);
            } else {
                spBootstrapLog.warn(
                    `Factory reset: שמירת ${file.label} חזרה עם סטטוס ${response?.status ?? 'unknown'}`
                );
            }
        } catch (error) {
            summary.push({
                key: file.key,
                ok: false,
                status: null,
                serverRelativeUrl: file.serverRelativeUrl,
                error: error?.message || String(error),
            });
            spBootstrapLog.warn(`Factory reset: נכשל בעדכון ${file.label} (${file.serverRelativeUrl})`, error);
        }
    }

    return summary;
};
