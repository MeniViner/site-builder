import React, { createContext, useState, useEffect, useContext } from 'react';
import EventsService from '../services/EventsService';

const EventsContext = createContext();

export const useEvents = () => useContext(EventsContext);

export const EventsProvider = ({ children }) => {
    const [events, setEvents] = useState([]);
    const [displayCount, setDisplayCount] = useState(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const data = await EventsService.getEvents();
            setEvents(data.events || []);
            setDisplayCount(data.displayCount || 3);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveEvents = async (newEvents, newDisplayCount) => {
        try {
            setLoading(true);
            const payload = { displayCount: newDisplayCount, events: newEvents };
            await EventsService.saveEvents(payload);
            setEvents(newEvents);
            setDisplayCount(newDisplayCount);
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
        fetchEvents();
    }, []);

    return (
        <EventsContext.Provider value={{ events, displayCount, loading, error, saveEvents, fetchEvents }}>
            {children}
        </EventsContext.Provider>
    );
};
