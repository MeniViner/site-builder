import React, { createContext, useState, useEffect, useContext } from 'react';
import SiteContentService from '../services/SiteContentService';

export const SiteContentContext = createContext();

export const useSiteContent = () => useContext(SiteContentContext);

export const SiteContentProvider = ({ children }) => {
    const [siteContent, setSiteContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSiteContent = async () => {
        try {
            setLoading(true);
            const data = await SiteContentService.getSiteContent();
            setSiteContent(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveSiteContent = async (newContent) => {
        try {
            setLoading(true);
            await SiteContentService.saveSiteContent(newContent);
            setSiteContent(newContent);
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
        fetchSiteContent();
    }, []);

    return (
        <SiteContentContext.Provider value={{ siteContent, loading, error, saveSiteContent, fetchSiteContent }}>
            {children}
        </SiteContentContext.Provider>
    );
};
