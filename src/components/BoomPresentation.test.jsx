import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoomPresentation from './BoomPresentation';

const boom = {
    pageTitle: 'תמונת מצב',
    description: 'בקרה שוטפת',
    design: {
        preset: 'command-center',
        showSummaryStrip: true,
        summaryMetrics: ['total', 'active', 'categories'],
        tableDensity: 'compact',
        showCategoryColors: true,
        showSummaryChips: true,
        accent: 'sky',
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
    it('renders a compact, ordered summary strip above the task table', () => {
        render(<BoomPresentation boom={boom} />);

        const strip = screen.getByTestId('boom-summary-strip');
        expect(screen.getByTestId('boom-task-table')).toBeInTheDocument();
        expect(strip).toHaveTextContent('1משימות');
        expect(strip).toHaveTextContent('1בביצוע');
        expect(strip).toHaveTextContent('1תחומים');
        expect(screen.queryByTestId('boom-summary-blocked')).not.toBeInTheDocument();
        expect(strip.children[0]).toHaveAttribute('data-testid', 'boom-summary-total');
        expect(strip.children[1]).toHaveAttribute('data-testid', 'boom-summary-active');
    });

    it('omits the summary strip when it is hidden', () => {
        render(<BoomPresentation boom={{ ...boom, design: { ...boom.design, showSummaryStrip: false } }} />);

        expect(screen.queryByTestId('boom-summary-strip')).not.toBeInTheDocument();
        expect(screen.getByTestId('boom-task-table')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'תמונת מצב' })).toBeInTheDocument();
    });

    it('uses normal utility-page title sizing rather than a hero heading', () => {
        render(<BoomPresentation boom={boom} />);

        expect(screen.getByRole('heading', { name: 'תמונת מצב' })).toHaveClass('text-xl', 'sm:text-2xl');
    });
});
