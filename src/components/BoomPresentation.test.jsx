import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoomPresentation from './BoomPresentation';

const boom = {
    pageTitle: 'תמונת מצב',
    description: 'בקרה שוטפת',
    design: {
        preset: 'command-center',
        showDashboard: true,
        dashboardTitle: 'לוח בקרה',
        dashboardWidgets: ['overview', 'categories'],
        dashboardDensity: 'comfortable',
        tableDensity: 'compact',
        showCategoryColors: true,
        showSummaryChips: true,
        accent: 'sky',
        cardEmphasis: 'outlined',
        headerStyle: 'standard',
    },
    categories: [{ id: 'ops', name: 'מבצעים', color: '#2563eb', order: 1 }],
    items: [{
        id: 'task-1',
        title: 'משימת מבחן',
        category: 'מבצעים',
        owner: 'חדר מבצעים',
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        details: '',
        color: '#2563eb',
        order: 1,
    }],
};

describe('BoomPresentation', () => {
    it('renders dashboard and task table as separate public sections', () => {
        render(<BoomPresentation boom={boom} />);

        expect(screen.getByTestId('boom-dashboard')).toBeInTheDocument();
        expect(screen.getByTestId('boom-task-table')).toBeInTheDocument();
        expect(screen.getByText('לוח בקרה')).toBeInTheDocument();
        expect(screen.queryByText('התפלגות סטטוסים')).not.toBeInTheDocument();
    });

    it('starts directly with the task section when the dashboard is hidden', () => {
        render(<BoomPresentation boom={{ ...boom, design: { ...boom.design, showDashboard: false } }} />);

        expect(screen.queryByTestId('boom-dashboard')).not.toBeInTheDocument();
        expect(screen.getByTestId('boom-task-table')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'תמונת מצב' })).toBeInTheDocument();
    });
});
