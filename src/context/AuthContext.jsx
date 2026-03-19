import React, { createContext, useContext, useState, useEffect } from 'react';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import UsersService from '../services/UsersService';

const AuthContext = createContext(null);
const SESSION_USER_NAME_KEY = 'tracker_user_name';
const SESSION_USER_IDENTITY_KEY = 'tracker_user_identity';

const normalizeIdentityText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
};

const normalizePersonalNumber = (value) => String(value ?? '').replace(/\D/g, '');

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

    const displayName = String(input?.displayName ?? input?.name ?? input?.title ?? '').trim();
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

const userMatchesAdminEntry = (user, adminEntry) => {
    const normalizedDisplayName = normalizeIdentityText(user?.displayName);
    const normalizedEmail = normalizeIdentityText(user?.email);
    const normalizedLoginName = normalizeIdentityText(user?.loginName);
    const normalizedPersonalNumber = normalizePersonalNumber(user?.personalNumber);
    const userDigitTokens = new Set([
        ...extractDigitTokens(user?.displayName),
        ...extractDigitTokens(user?.email),
        ...extractDigitTokens(user?.loginName),
    ]);

    if (normalizedPersonalNumber) userDigitTokens.add(normalizedPersonalNumber);

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
            console.warn('Invalid tracker_user_identity JSON in sessionStorage, falling back to tracker_user_name');
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
            const response = await fetch('/_api/web/currentuser', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json;odata=verbose'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const user = normalizeCurrentUser({
                    displayName: data?.d?.Title || '',
                    loginName: data?.d?.LoginName || '',
                    email: data?.d?.Email || '',
                });

                if (user.displayName) {
                    signIn(user, adminUsers);
                    return true;
                }
            }
            return false;
        } catch {
            console.log('SharePoint user detection not available (likely in dev mode)');
            return false;
        }
    };

    useEffect(() => {
        const initAuth = async () => {
            // First, fetch the allowed users list
            let sysUsers = [];
            try {
                sysUsers = await UsersService.getUsers();
                setAdminUsersInfo(sysUsers);
            } catch (e) {
                console.error("Error fetching admin users, falling back to empty list", e);
            }

            const storedUser = readStoredUser();

            if (storedUser) {
                setCurrentUser(storedUser);
                setIsAdmin(
                    (SHAREPOINT_CONFIG.useMock && SHAREPOINT_CONFIG.allowMockAdminBypass)
                    || isAdminByList(storedUser, sysUsers)
                );
            } else if (SHAREPOINT_CONFIG.useMock && SHAREPOINT_CONFIG.allowMockAdminBypass) {
                setIsAdmin(true);
            } else if (!SHAREPOINT_CONFIG.useMock) {
                // Attempt to auto-login via SharePoint if no user in session
                await trySharePointLogin(sysUsers);
            }

            setLoading(false);
        };

        initAuth();
    }, []);

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
