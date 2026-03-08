import React, { createContext, useState, useEffect, useContext } from 'react';
import ExternalLinksService from '../services/ExternalLinksService';

const ExternalLinksContext = createContext();

export const useExternalLinks = () => useContext(ExternalLinksContext);

export const ExternalLinksProvider = ({ children }) => {
    const [externalLinks, setExternalLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchExternalLinks = async () => {
        try {
            setLoading(true);
            const data = await ExternalLinksService.getExternalLinks();
            setExternalLinks(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveExternalLinks = async (newLinks) => {
        try {
            setLoading(true);
            await ExternalLinksService.saveExternalLinks(newLinks);
            setExternalLinks(newLinks);
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
        fetchExternalLinks();
    }, []);

    return (
        <ExternalLinksContext.Provider value={{ externalLinks, loading, error, saveExternalLinks, fetchExternalLinks }}>
            {children}
        </ExternalLinksContext.Provider>
    );
};
