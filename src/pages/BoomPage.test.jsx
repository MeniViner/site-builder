import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BoomPage from './BoomPage';

const state = vi.hoisted(() => ({
    enabled: true,
}));

vi.mock('../components/home/NavigationBar', () => ({
    default: ({ onOpenAdmin }) => <button type="button" onClick={onOpenAdmin}>navigation</button>,
}));
vi.mock('../context/NavigationContext', () => ({ useNavigation: () => ({ navItems: [] }) }));
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ currentUser: { displayName: 'Tester' }, isAdmin: true, loading: false }),
}));
vi.mock('../context/SiteContentContext', () => ({
    useSiteContent: () => ({ siteContent: { hero: { siteName: 'Test Site' } } }),
}));
vi.mock('../context/ThemeContext', () => ({
    useTheme: () => ({
        theme: {},
        effectiveMode: 'light',
        toggleUserMode: vi.fn(),
        borderTargets: {},
    }),
}));
vi.mock('../context/BoomContext', () => ({
    useBoom: () => ({
        loading: false,
        loaded: true,
        boom: {
            enabled: state.enabled,
            pageTitle: 'BOOM ציבורי',
            description: 'תמונת מצב',
            categories: [{ id: 'general', name: 'כללי', color: '#2563eb', order: 1 }],
            items: [{
                id: 'task-1',
                title: 'משימה לקריאה בלבד',
                category: 'כללי',
                owner: 'אחראי',
                status: 'active',
                startDate: '2026-01-01',
                endDate: '2026-01-10',
                progress: 45,
                details: '',
                color: '#2563eb',
                order: 1,
            }],
        },
    }),
}));

describe('BoomPage', () => {
    it('renders the shared BOOM table read-only', () => {
        state.enabled = true;
        render(<MemoryRouter><BoomPage /></MemoryRouter>);

        expect(screen.getByRole('heading', { name: 'BOOM ציבורי' })).toBeInTheDocument();
        expect(screen.getAllByText('משימה לקריאה בלבד')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: 'ערוך משימה' })).not.toBeInTheDocument();
        expect(screen.queryByText('מחק')).not.toBeInTheDocument();
    });

    it('does not expose tasks when BOOM is disabled', () => {
        state.enabled = false;
        render(<MemoryRouter><BoomPage /></MemoryRouter>);

        expect(screen.getByText('עמוד BOOM אינו פעיל באתר זה.')).toBeInTheDocument();
        expect(screen.queryByText('משימה לקריאה בלבד')).not.toBeInTheDocument();
    });
});
