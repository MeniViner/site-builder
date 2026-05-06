import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import UsersService from './UsersService';
import { fetchSharePointAdmins } from '../utils/sharepointAdmins';
import { addAdminLogEntry, type AdminLogEntry } from './adminManagementLogger';
import {
    hasAdminUsersListChanged,
    mergeUsersWithSharePointAdmins,
    normalizeAdminRecord,
} from './adminSourcesSyncService';

const PREFIX = '[TxtAdminsSync]';

export const listTxtAdmins = async (logs: AdminLogEntry[] = []) => {
    addAdminLogEntry(logs, PREFIX, 'info', 'list-txt-admins-start', 'Starting TXT admins panel refresh', {
        loadedFilePathServerRelative: SHAREPOINT_PATHS.usersFileServerRelativeUrl,
    });
    const users = await UsersService.getUsers();
    const normalized = (Array.isArray(users) ? users : []).map((item, idx) => normalizeAdminRecord(item, idx));
    addAdminLogEntry(logs, PREFIX, 'info', 'list-txt-admins', 'Loaded TXT admins', {
        currentCount: Array.isArray(users) ? users.length : 0,
        normalizedCount: normalized.length,
        loadedFilePathServerRelative: SHAREPOINT_PATHS.usersFileServerRelativeUrl,
    });
    return normalized;
};

export const addTxtAdminFromSharePointUser = async (user: Record<string, unknown>, logs: AdminLogEntry[] = []) => {
    const txtAdmins = await listTxtAdmins(logs);
    const candidate = normalizeAdminRecord(user, txtAdmins.length);
    candidate.role = 'admin';

    const merged = mergeUsersWithSharePointAdmins(txtAdmins, [candidate]);
    if (!hasAdminUsersListChanged(txtAdmins, merged)) {
        addAdminLogEntry(logs, PREFIX, 'info', 'add-txt-admin', 'User already exists in TXT admins', {
            loginName: candidate.loginName,
            personalNumber: candidate.personalNumber,
        });
        return { ok: true, changed: false, users: txtAdmins, logs };
    }

    await UsersService.saveUsers(merged);
    addAdminLogEntry(logs, PREFIX, 'info', 'add-txt-admin', 'User added to TXT admins', {
        loginName: candidate.loginName,
        personalNumber: candidate.personalNumber,
        total: merged.length,
    });
    return { ok: true, changed: true, users: merged, logs };
};

export const removeTxtAdmin = async (personalNumberOrUserId: string, logs: AdminLogEntry[] = []) => {
    const token = String(personalNumberOrUserId ?? '').trim().toLowerCase();
    const txtAdmins = await listTxtAdmins(logs);
    const filtered = txtAdmins.filter((user) => {
        const id = String(user.id || '').toLowerCase();
        const pn = String(user.personalNumber || '').toLowerCase();
        const login = String(user.loginName || '').toLowerCase();
        const email = String(user.email || '').toLowerCase();
        return !(id === token || pn === token || login === token || email === token);
    });

    if (!hasAdminUsersListChanged(txtAdmins, filtered)) {
        addAdminLogEntry(logs, PREFIX, 'warn', 'remove-txt-admin', 'TXT user was not found for removal token', {
            token,
        });
        return { ok: false, changed: false, users: txtAdmins, logs };
    }

    await UsersService.saveUsers(filtered);
    addAdminLogEntry(logs, PREFIX, 'info', 'remove-txt-admin', 'TXT admin removed', {
        token,
        total: filtered.length,
    });
    return { ok: true, changed: true, users: filtered, logs };
};

export const syncSiteCollectionAdminsToTxtAdmins = async (logs: AdminLogEntry[] = []) => {
    const txtAdmins = await listTxtAdmins(logs);
    const sharePointAdmins = await fetchSharePointAdmins();
    const merged = mergeUsersWithSharePointAdmins(txtAdmins, sharePointAdmins);
    const changed = hasAdminUsersListChanged(txtAdmins, merged);

    if (changed) {
        await UsersService.saveUsers(merged);
    }

    addAdminLogEntry(logs, PREFIX, 'info', 'sync-site-admins-to-txt', 'Sync Site Collection Admins to TXT completed', {
        txtAdminsBefore: txtAdmins.length,
        sharePointAdmins: Array.isArray(sharePointAdmins) ? sharePointAdmins.length : 0,
        txtAdminsAfter: merged.length,
        changed,
    });

    return {
        ok: true,
        changed,
        beforeCount: txtAdmins.length,
        afterCount: merged.length,
        siteAdminsCount: Array.isArray(sharePointAdmins) ? sharePointAdmins.length : 0,
        users: merged,
        logs,
    };
};
