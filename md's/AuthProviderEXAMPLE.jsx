import React, { createContext, useContext, useState, useEffect } from 'react';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';

const AuthContext = createContext(null);

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

    // Admin users list (hardcoded for now - can be moved to config later)
    const ADMIN_USERS = ['מני', 'Admin', 'מנהל'];

    useEffect(() => {
        // Check if user is already logged in (SessionStorage)
        const storedUserName = sessionStorage.getItem('tracker_user_name');

        if (storedUserName) {
            const user = {
                displayName: storedUserName,
                email: storedUserName // Use name as email for compatibility
            };
            setCurrentUser(user);

            // Check if admin
            setIsAdmin(SHAREPOINT_CONFIG.useMock || ADMIN_USERS.includes(storedUserName));
        }

        setLoading(false);
    }, []);

    const signIn = (userName) => {
        if (!userName || userName.trim() === '') {
            throw new Error('שם משתמש נדרש');
        }

        const trimmedName = userName.trim();

        // Store in SessionStorage
        sessionStorage.setItem('tracker_user_name', trimmedName);

        const user = {
            displayName: trimmedName,
            email: trimmedName
        };

        setCurrentUser(user);
        setIsAdmin(SHAREPOINT_CONFIG.useMock || ADMIN_USERS.includes(trimmedName));
    };

    const signOut = () => {
        sessionStorage.removeItem('tracker_user_name');
        setCurrentUser(null);
        setIsAdmin(false);
    };

    /**
     * Attempt to fetch current SharePoint user (optional, for production use)
     * This can be called on mount if you want to auto-detect SharePoint user
     */
    const trySharePointLogin = async () => {
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
                const userName = data.d.Title || data.d.LoginName;

                if (userName) {
                    signIn(userName);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.log('SharePoint user detection not available (likely in dev mode)');
            return false;
        }
    };

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
