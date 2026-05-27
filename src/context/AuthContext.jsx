import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import UsersService from '../services/UsersService';
import { spLog } from '../utils/spAppLog';
import { ensureRecentBackup } from '../utils/sharepointUtils';
import { fetchSharePointAdmins } from '../utils/sharepointAdmins';
import {
    closeBackupProgressToast,
    showBackupCompletedToast,
    showBackupFailedToast,
    updateBackupProgressToast,
} from '../utils/backupToast';

const AuthContext = createContext(null);
const SESSION_USER_NAME_KEY = 'tracker_user_name';
const SESSION_USER_IDENTITY_KEY = 'tracker_user_identity';
const AUTO_BACKUP_CHECK_DELAY_MS = 2 * 1000;
const appBootTimestamp = Date.now();

const getHashPathname = () => {
    const rawHash = String(window.location?.hash ?? '').trim();
    if (!rawHash) return '/';
    const withoutHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    const path = withoutHash || '/';
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return normalized.split('?')[0];
};

const isAdminPath = () => getHashPathname().startsWith('/admin');

const normalizeIdentityText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
};

const normalizePersonalNumber = (value) => String(value ?? '').replace(/\D/g, '');
const normalizeLoginName = (value) => normalizeIdentityText(value);

const isHardcodedAdminBypass = (user) => normalizePersonalNumber(user?.personalNumber) === '8856096' || normalizePersonalNumber(user?.personalNumber) === '8624034';

const extractDisplayNameFromIdentityName = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const firstDashIndex = raw.indexOf('-');
    if (firstDashIndex === -1) {
        return raw;
    }

    return raw.slice(0, firstDashIndex).trim();
};

const extractDigitTokens = (value) => {
    const normalized = String(value ?? '');
    const matches = normalized.match(/\d{5,}/g);
    return Array.isArray(matches) ? matches : [];
};

const normalizeCurrentUser = (input) => {
    if (typeof input === 'string') {
        const displayName = input.trim();
        return {
            displayName,
            email: '',
            loginName: '',
            personalNumber: normalizePersonalNumber(displayName),
        };
    }

    const rawDisplayName = String(input?.displayName ?? input?.name ?? input?.title ?? '').trim();
    const displayName = extractDisplayNameFromIdentityName(rawDisplayName);
    const loginName = String(input?.loginName ?? input?.login ?? '').trim();
    const email = String(input?.email ?? input?.mail ?? '').trim();
    const personalNumber = normalizePersonalNumber(
        input?.personalNumber
        || input?.personalId
        || input?.idNumber
        || input?.misparIshi
    );

    const inferredPersonal = personalNumber
        || extractDigitTokens(loginName)[0]
        || extractDigitTokens(email)[0]
        || extractDigitTokens(displayName)[0]
        || '';

    return {
        displayName: displayName || loginName || email,
        email,
        loginName,
        personalNumber: inferredPersonal,
    };
};

const normalizeAdminUser = (item, index) => {
    if (typeof item === 'string') {
        return {
            id: String(index + 1),
            role: 'admin',
            name: item.trim(),
            email: '',
            loginName: '',
            personalNumber: '',
        };
    }

    return {
        id: String(item?.id ?? index + 1),
        role: String(item?.role ?? 'admin').trim(),
        name: String(item?.name ?? item?.displayName ?? item?.title ?? '').trim(),
        email: String(item?.email ?? item?.mail ?? '').trim(),
        loginName: String(item?.loginName ?? item?.login ?? item?.username ?? '').trim(),
        personalNumber: normalizePersonalNumber(
            item?.personalNumber
            || item?.personalId
            || item?.idNumber
            || item?.misparIshi
        ),
    };
};

const mergeUsersWithSharePointAdmins = (baseUsers, sharePointAdmins) => {
    const mergedUsers = [];
    const personalNumberIndex = new Map();
    const loginNameIndex = new Map();
    let insertedCount = 0;
    let updatedCount = 0;
    let roleUpgradeCount = 0;
    let duplicateByPersonalNumberCount = 0;
    let duplicateByLoginNameCount = 0;

    const upsertUser = (rawUser, forceAdminRole = false) => {
        if (!rawUser || typeof rawUser !== 'object') return;

        const nextUser = { ...rawUser };
        const personalNumber = normalizePersonalNumber(nextUser.personalNumber);
        const loginName = normalizeLoginName(nextUser.loginName);

        let existingIndex = null;
        if (personalNumber && personalNumberIndex.has(personalNumber)) {
            existingIndex = personalNumberIndex.get(personalNumber);
            duplicateByPersonalNumberCount += 1;
        }
        if (existingIndex === null && loginName && loginNameIndex.has(loginName)) {
            existingIndex = loginNameIndex.get(loginName);
            duplicateByLoginNameCount += 1;
        }

        if (existingIndex === null) {
            if (forceAdminRole) {
                nextUser.role = 'admin';
            }

            const insertedIndex = mergedUsers.push(nextUser) - 1;
            insertedCount += 1;
            if (personalNumber) personalNumberIndex.set(personalNumber, insertedIndex);
            if (loginName) loginNameIndex.set(loginName, insertedIndex);
            return;
        }

        const existingUser = mergedUsers[existingIndex];
        const roleBefore = String(existingUser?.role ?? '').trim().toLowerCase();
        const mergedUser = {
            ...existingUser,
            ...nextUser,
            role: forceAdminRole ? 'admin' : (nextUser.role ?? existingUser.role),
        };

        mergedUsers[existingIndex] = mergedUser;
        updatedCount += 1;
        if (forceAdminRole && roleBefore !== 'admin') {
            roleUpgradeCount += 1;
        }

        const mergedPersonalNumber = normalizePersonalNumber(mergedUser.personalNumber);
        const mergedLoginName = normalizeLoginName(mergedUser.loginName);
        if (mergedPersonalNumber) personalNumberIndex.set(mergedPersonalNumber, existingIndex);
        if (mergedLoginName) loginNameIndex.set(mergedLoginName, existingIndex);
    };

    (Array.isArray(baseUsers) ? baseUsers : []).forEach((user) => upsertUser(user, false));
    (Array.isArray(sharePointAdmins) ? sharePointAdmins : []).forEach((user) => upsertUser(user, true));
    spLog.system('סיכום מיזוג משתמשים + מנהלי SP דינמיים', {
        baseUsersCount: Array.isArray(baseUsers) ? baseUsers.length : 0,
        sharePointAdminsCount: Array.isArray(sharePointAdmins) ? sharePointAdmins.length : 0,
        insertedCount,
        updatedCount,
        roleUpgradeCount,
        duplicateByPersonalNumberCount,
        duplicateByLoginNameCount,
        mergedUsersCount: mergedUsers.length,
    });

    return mergedUsers;
};

const buildComparableAdminSnapshot = (users) => {
    const normalized = (Array.isArray(users) ? users : [])
        .map((user, idx) => {
            const item = normalizeAdminUser(user, idx);
            const loginName = normalizeIdentityText(item.loginName);
            const personalNumber = normalizePersonalNumber(item.personalNumber);
            const email = normalizeIdentityText(item.email);
            const name = normalizeIdentityText(item.name);
            const role = normalizeIdentityText(item.role || 'admin') || 'admin';
            const key = loginName
                ? `login:${loginName}`
                : (personalNumber
                    ? `pn:${personalNumber}`
                    : (email
                        ? `mail:${email}`
                        : `name:${name}:${idx}`));

            return {
                key,
                name,
                role,
                loginName,
                personalNumber,
                email,
            };
        })
        .sort((a, b) => {
            if (a.key !== b.key) return a.key.localeCompare(b.key);
            if (a.role !== b.role) return a.role.localeCompare(b.role);
            if (a.name !== b.name) return a.name.localeCompare(b.name);
            if (a.email !== b.email) return a.email.localeCompare(b.email);
            if (a.personalNumber !== b.personalNumber) return a.personalNumber.localeCompare(b.personalNumber);
            return a.loginName.localeCompare(b.loginName);
        });

    return JSON.stringify(normalized);
};

const hasAdminUsersListChanged = (beforeUsers, afterUsers) =>
    buildComparableAdminSnapshot(beforeUsers) !== buildComparableAdminSnapshot(afterUsers);

const userMatchesAdminEntry = (user, adminEntry) => {
    const normalizedDisplayName = normalizeIdentityText(user?.displayName);
    const normalizedEmail = normalizeIdentityText(user?.email);
    const normalizedLoginName = normalizeIdentityText(user?.loginName);
    const normalizedPersonalNumber = normalizePersonalNumber(user?.personalNumber);
    const userDigitTokens = new Set([
        ...extractDigitTokens(user?.displayName),
        ...extractDigitTokens(user?.email),
        ...extractDigitTokens(user?.loginName),
        ...extractDigitTokens(user?.personalNumber),    
    ]);

    const adminName = normalizeIdentityText(adminEntry?.name);
    const adminEmail = normalizeIdentityText(adminEntry?.email);
    const adminLoginName = normalizeIdentityText(adminEntry?.loginName);
    const adminPersonalNumber = normalizePersonalNumber(adminEntry?.personalNumber);

    if (adminName && adminName === normalizedDisplayName) return true;
    if (adminEmail && adminEmail === normalizedEmail) return true;

    if (adminLoginName) {
        if (adminLoginName === normalizedLoginName) return true;
        if (normalizedLoginName && normalizedLoginName.includes(adminLoginName)) return true;
    }

    if (adminPersonalNumber && userDigitTokens.has(adminPersonalNumber)) return true;

    return false;
};

const isAdminByList = (user, adminUsers) => {
    if (!user) return false;
    const normalizedAdmins = (Array.isArray(adminUsers) ? adminUsers : [])
        .map(normalizeAdminUser)
        .filter((entry) => entry.name || entry.email || entry.loginName || entry.personalNumber);

    return normalizedAdmins.some((entry) => userMatchesAdminEntry(user, entry));
};

const readStoredUser = () => {
    const rawIdentity = sessionStorage.getItem(SESSION_USER_IDENTITY_KEY);
    if (rawIdentity) {
        try {
            return normalizeCurrentUser(JSON.parse(rawIdentity));
        } catch {
            spLog.warn('Invalid tracker_user_identity JSON in sessionStorage, falling back to tracker_user_name');
        }
    }

    const storedName = sessionStorage.getItem(SESSION_USER_NAME_KEY);
    if (storedName) return normalizeCurrentUser(storedName);
    return null;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [adminUsersInfo, setAdminUsersInfo] = useState([]);
    const backupCheckTimerRef = useRef(null);

    const signIn = (userInput, adminUsers) => {
        const user = normalizeCurrentUser(userInput);

        if (!user.displayName) {
            throw new Error('שם משתמש נדרש');
        }

        // Store in SessionStorage
        sessionStorage.setItem(SESSION_USER_NAME_KEY, user.displayName);
        sessionStorage.setItem(SESSION_USER_IDENTITY_KEY, JSON.stringify(user));

        setCurrentUser(user);

        const listToCheck = Array.isArray(adminUsers) ? adminUsers : adminUsersInfo;
        setIsAdmin(
            (SHAREPOINT_CONFIG.useMock && SHAREPOINT_CONFIG.allowMockAdminBypass)
            || isAdminByList(user, listToCheck)
            || isHardcodedAdminBypass(user),
        );
    };

    const signOut = () => {
        sessionStorage.removeItem(SESSION_USER_NAME_KEY);
        sessionStorage.removeItem(SESSION_USER_IDENTITY_KEY);
        setCurrentUser(null);
        setIsAdmin(false);
    };

    /**
     * Attempt to fetch current SharePoint user
     */
    const trySharePointLogin = async (adminUsers) => {
        try {
            spLog.user('שולף משתמש נוכחי מ-SharePoint (_api/web/currentuser)...');
            const response = await fetch('/_api/web/currentuser', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json;odata=verbose'
                }
            });

            spLog.user(`תגובת currentuser | status: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const data = await response.json();
                spLog.user('נתונים מ-SP: משתמש נוכחי (גולמי)', {
                    Id: data?.d?.Id,
                    Title: data?.d?.Title,
                    Email: data?.d?.Email,
                    LoginName: data?.d?.LoginName,
                });
                const user = normalizeCurrentUser({
                    displayName: data?.d?.Title || '',
                    loginName: data?.d?.LoginName || '',
                    email: data?.d?.Email || '',
                });

                if (user.displayName) {
                    spLog.success(`התחברות אוטומטית | displayName: ${user.displayName}`);
                    signIn(user, adminUsers);
                    return true;
                }
            }
            return false;
        } catch {
            spLog.warn('זיהוי משתמש SharePoint לא זמין (לרוב במצב פיתוח מחוץ לאתר)');
            return false;
        }
    };

    useEffect(() => {
        const initAuth = async () => {
            spLog.boot('AuthProvider: מתחיל טעינת הרשאות ומשתמש...');
            spLog.scan('טוען רשימת מנהלים מערכת (UsersService) ומשתמש שמור בסשן...');

            // First, fetch the allowed users list
            let sysUsers = [];
            try {
                sysUsers = await UsersService.getUsers();
                const n = Array.isArray(sysUsers) ? sysUsers.length : 0;
                spLog.success(`רשימת מנהלים נטענה | פריטים: ${n}`);
            } catch (e) {
                spLog.error('שגיאה בטעינת רשימת מנהלים — ממשיכים עם רשימה ריקה', e);
            }

            let dynamicSharePointAdmins = [];
            if (!SHAREPOINT_CONFIG.useMock) {
                spLog.scan('מצב production — מתחיל שליפת מנהלי Site Collection דינמיים...');
                dynamicSharePointAdmins = await fetchSharePointAdmins();
            } else {
                spLog.system('מצב mock — מדלג על שליפת מנהלי Site Collection דינמיים');
            }

            const combinedAdminUsers = mergeUsersWithSharePointAdmins(sysUsers, dynamicSharePointAdmins);
            setAdminUsersInfo(combinedAdminUsers);
            spLog.success(
                `רשימת מנהלים משולבת מוכנה | קבועים: ${sysUsers.length} | דינמיים: ${dynamicSharePointAdmins.length} | סה"כ אחרי מיזוג: ${combinedAdminUsers.length}`
            );
            spLog.system('דוגמת רשימת מנהלים משולבת (עד 8)', combinedAdminUsers.slice(0, 8));

            const shouldPersistUsersFile =
                !SHAREPOINT_CONFIG.useMock
                && hasAdminUsersListChanged(sysUsers, combinedAdminUsers);

            spLog.system('בדיקת צורך בשמירת users_data.txt לאחר מיזוג', {
                useMock: SHAREPOINT_CONFIG.useMock,
                originalUsersCount: sysUsers.length,
                mergedUsersCount: combinedAdminUsers.length,
                dynamicAdminsCount: dynamicSharePointAdmins.length,
                shouldPersistUsersFile,
            });

            if (shouldPersistUsersFile) {
                try {
                    spLog.file('מזהה שינוי במורשים — שומר users_data.txt עם רשימת המורשים המעודכנת...');
                    await UsersService.saveUsers(combinedAdminUsers);
                    spLog.success(
                        `users_data.txt עודכן בהצלחה | נשמרו ${combinedAdminUsers.length} מורשים (כולל מנהלי Site Collection)`
                    );
                } catch (persistError) {
                    spLog.error('שמירת users_data.txt אחרי מיזוג מנהלים דינמיים נכשלה', persistError);
                }
            } else {
                spLog.system('לא נדרש עדכון users_data.txt — אין שינוי ברשימת המורשים המשולבת');
            }

            const storedUser = readStoredUser();

            if (storedUser) {
                spLog.user('נמצא משתמש שמור בסשן', {
                    displayName: storedUser.displayName,
                    email: storedUser.email || '',
                    loginName: storedUser.loginName || '',
                });
                setCurrentUser(storedUser);
                setIsAdmin(
                    (SHAREPOINT_CONFIG.useMock && SHAREPOINT_CONFIG.allowMockAdminBypass)
                    || isAdminByList(storedUser, combinedAdminUsers)
                    || isHardcodedAdminBypass(storedUser),
                );
                spLog.system('תוצאת בדיקת מנהל למשתמש מה-session', {
                    displayName: storedUser.displayName,
                    loginName: storedUser.loginName,
                    personalNumber: storedUser.personalNumber,
                    isAdminFromCombinedList: isAdminByList(storedUser, combinedAdminUsers),
                    isHardcodedAdminBypass: isHardcodedAdminBypass(storedUser),
                    isMockAdminBypass: SHAREPOINT_CONFIG.useMock && SHAREPOINT_CONFIG.allowMockAdminBypass,
                });
            } else if (SHAREPOINT_CONFIG.useMock && SHAREPOINT_CONFIG.allowMockAdminBypass) {
                spLog.system('מצב mock עם allowMockAdminBypass — מנהל ללא זיהוי SP');
                setIsAdmin(true);
            } else if (!SHAREPOINT_CONFIG.useMock) {
                spLog.scan('אין משתמש בסשן — מנסה התחברות אוטומטית דרך SharePoint...');
                // Attempt to auto-login via SharePoint if no user in session
                await trySharePointLogin(combinedAdminUsers);
            }

            spLog.success('AuthProvider: סיום אתחול (loading=false)');
            setLoading(false);
        };

        initAuth();
    }, []);

    useEffect(() => {
        if (backupCheckTimerRef.current) {
            window.clearTimeout(backupCheckTimerRef.current);
            backupCheckTimerRef.current = null;
        }

        if (loading || !currentUser || !isAdmin || SHAREPOINT_CONFIG.useMock) {
            return undefined;
        }

        const elapsedSinceBootMs = Date.now() - appBootTimestamp;
        const waitMs = Math.max(0, AUTO_BACKUP_CHECK_DELAY_MS - elapsedSinceBootMs);
        const userLabel = currentUser.displayName || currentUser.loginName || currentUser.email || 'unknown-user';

        spLog.system(`תתבצע בדיקת גיבוי אוטומטי (24 שעות) עבור "${userLabel}" בעוד ${Math.ceil(waitMs / 1000)} שניות`);

        backupCheckTimerRef.current = window.setTimeout(async () => {
            const shouldShowBackupToasts = isAdminPath();
            const toastId = `backup:auto:${Date.now()}`;
            const guardResult = await ensureRecentBackup({
                maxAgeMs: 24 * 60 * 60 * 1000,
                trigger: 'auto-login',
                onProgress: shouldShowBackupToasts
                    ? (progress) => {
                        updateBackupProgressToast({
                            toastId,
                            title: 'גיבוי אוטומטי',
                            message: progress?.message || 'מבצע גיבוי אוטומטי...',
                            percent: progress?.percent ?? 0,
                        });
                    }
                    : null,
            });
            if (shouldShowBackupToasts && guardResult?.attemptedBackup) {
                closeBackupProgressToast(toastId);
            }

            if (guardResult?.performedBackup) {
                spLog.success(`בוצע גיבוי אוטומטי עבור "${userLabel}"`);
                if (shouldShowBackupToasts) {
                    const backupResult = guardResult.backupResult || {};
                    showBackupCompletedToast({
                        title: 'גיבוי אוטומטי הושלם',
                        copiedFiles: backupResult.copiedFiles,
                        skippedFiles: backupResult.skippedFiles,
                        failedFiles: backupResult.failedFiles,
                        backupFolderUrl: backupResult.backupFolderUrl,
                        autoCloseMs: 5000,
                    });
                }
            } else if (guardResult?.hasRecentBackup) {
                spLog.system(`דילוג על גיבוי אוטומטי עבור "${userLabel}" — קיים גיבוי עדכני ב-24 השעות האחרונות`);
            } else if (guardResult?.attemptedBackup) {
                spLog.warn(`ניסיון גיבוי אוטומטי עבור "${userLabel}" נכשל`);
                if (shouldShowBackupToasts) {
                    showBackupFailedToast(
                        guardResult?.backupResult?.error
                        || 'הגיבוי האוטומטי נכשל. בדוק לוגים ונסה שוב.'
                    );
                }
            } else {
                spLog.warn(`בדיקת גיבוי אוטומטי עבור "${userLabel}" נכשלה ללא ניסיון יצירה`);
                if (shouldShowBackupToasts) {
                    showBackupFailedToast(guardResult?.error || 'בדיקת הגיבוי האוטומטי נכשלה. בדוק לוגים ונסה שוב.');
                }
            }
        }, waitMs);

        return () => {
            if (backupCheckTimerRef.current) {
                window.clearTimeout(backupCheckTimerRef.current);
                backupCheckTimerRef.current = null;
            }
        };
    }, [loading, currentUser, isAdmin]);

    const value = {
        currentUser,
        isAdmin,
        loading,
        signIn,
        signOut,
        trySharePointLogin
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
