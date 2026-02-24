import React, { createContext, useState, useEffect, useContext } from 'react';
import NavigationService from '../services/NavigationService';

const NavigationContext = createContext();

export const useNavigation = () => useContext(NavigationContext);

export const NavigationProvider = ({ children }) => {
    const [navItems, setNavItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchNavigation = async () => {
        try {
            setLoading(true);
            const data = await NavigationService.getNavigation();
            setNavItems(data || []);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveNavigation = async (newNavData) => {
        try {
            setLoading(true);
            await NavigationService.saveNavigation(newNavData);
            setNavItems(newNavData);
            setError(null);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNavigation();
    }, []);

    return (
        <NavigationContext.Provider value={{ navItems, loading, error, saveNavigation, fetchNavigation }}>
            {children}
        </NavigationContext.Provider>
    );
};
