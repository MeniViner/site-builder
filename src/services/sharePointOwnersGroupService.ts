import resolveCurrentSharePointWebUrl from '../utils/resolveCurrentSharePointWebUrl';
import {
    addAdminLogEntry,
    mapSharePointErrorToHebrewMessage,
    mergeSharePointOwnersLogsToAdminLogs,
    type AdminLogEntry,
} from './adminManagementLogger';
import type { SharePointOwnersLogEntry } from './sharePointOwnersLogger';
import {
    addUserToAssociatedOwnersGroupByLoginNameForWeb,
    fetchAssociatedOwnersGroupUsersBundle,
    removeUserFromAssociatedOwnersGroupForWeb,
} from './sharePointOwnersService';

const PREFIX = '[OwnersGroup]';

const logWebResolution = (logs: AdminLogEntry[]) =>
    resolveCurrentSharePointWebUrl({
        onResolved: (data) =>
            addAdminLogEntry(logs, '[SharePointWebUrl]', 'info', 'resolve-current-web-url', 'Resolved SharePoint web URL', data),
    });

export const listAssociatedOwnersGroupUsers = async (logs: AdminLogEntry[] = []) => {
    addAdminLogEntry(logs, PREFIX, 'info', 'owners-refresh-start', 'Starting owners group panel refresh', {});

    const webUrl = logWebResolution(logs);
    const ownersLogs: SharePointOwnersLogEntry[] = [];

    const result = await fetchAssociatedOwnersGroupUsersBundle(webUrl, ownersLogs);
    mergeSharePointOwnersLogsToAdminLogs(logs, ownersLogs);

    if (!result.ok) {
        return {
            ok: false as const,
            userMessage: result.userMessage,
            logs,
        };
    }

    return {
        ok: true as const,
        ownersGroupId: result.ownersGroupId,
        ownersGroupTitle: result.ownersGroupTitle,
        users: result.users,
        logs,
    };
};

export const addUserToAssociatedOwnersGroupByLoginName = async (loginName: string, logs: AdminLogEntry[] = []) => {
    const ownersLogs: SharePointOwnersLogEntry[] = [];
    try {
        const webUrl = logWebResolution(logs);
        const result = await addUserToAssociatedOwnersGroupByLoginNameForWeb(webUrl, String(loginName || '').trim(), ownersLogs);
        mergeSharePointOwnersLogsToAdminLogs(logs, ownersLogs);
        if (!result.ok) {
            return { ok: false as const, userMessage: result.userMessage, error: result.error, logs };
        }
        return {
            ok: true as const,
            ownersGroupId: result.ownersGroupId,
            ownersGroupTitle: result.ownersGroupTitle,
            logs,
        };
    } catch (error) {
        mergeSharePointOwnersLogsToAdminLogs(logs, ownersLogs);
        return { ok: false as const, userMessage: mapSharePointErrorToHebrewMessage(error), error, logs };
    }
};

export const removeUserFromAssociatedOwnersGroup = async (userId: number, logs: AdminLogEntry[] = []) => {
    const ownersLogs: SharePointOwnersLogEntry[] = [];
    try {
        const webUrl = logWebResolution(logs);
        const result = await removeUserFromAssociatedOwnersGroupForWeb(webUrl, userId, ownersLogs);
        mergeSharePointOwnersLogsToAdminLogs(logs, ownersLogs);
        if (!result.ok) {
            return { ok: false as const, userMessage: result.userMessage, error: result.error, logs };
        }
        return {
            ok: true as const,
            ownersGroupId: result.ownersGroupId,
            ownersGroupTitle: result.ownersGroupTitle,
            logs,
        };
    } catch (error) {
        mergeSharePointOwnersLogsToAdminLogs(logs, ownersLogs);
        return { ok: false as const, userMessage: mapSharePointErrorToHebrewMessage(error), error, logs };
    }
};
