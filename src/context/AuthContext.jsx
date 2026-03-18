import React, { createContext, useContext, useState, useEffect } from 'react';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import UsersService from '../services/UsersService';

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
    const [adminUsersInfo, setAdminUsersInfo] = useState([]);

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

            const adminNames = sysUsers.map(u => u.name);
            // Check if user is already logged in (SessionStorage)
            const storedUserName = sessionStorage.getItem('tracker_user_name');

            if (storedUserName) {
                const user = {
                    displayName: storedUserName,
                    email: storedUserName // Use name as email for compatibility
                };
                setCurrentUser(user);

                // Check if admin
                setIsAdmin(SHAREPOINT_CONFIG.useMock || adminNames.includes(storedUserName));
            } else if (!SHAREPOINT_CONFIG.useMock) {
                // Attempt to auto-login via SharePoint if no user in session
                await trySharePointLogin(adminNames);
            }

            setLoading(false);
        };

        initAuth();
    }, []);

    const signIn = (userName, adminNames) => {
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

        // Use the passed adminNames or fallback to state
        const listToCheck = adminNames || adminUsersInfo.map(u => u.name);
        setIsAdmin(SHAREPOINT_CONFIG.useMock || listToCheck.includes(trimmedName));
    };

    const signOut = () => {
        sessionStorage.removeItem('tracker_user_name');
        setCurrentUser(null);
        setIsAdmin(false);
    };

    /**
     * Attempt to fetch current SharePoint user
     */
    const trySharePointLogin = async (adminNames) => {
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
                    signIn(userName, adminNames);
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
