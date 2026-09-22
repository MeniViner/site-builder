import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminSiteContent from './AdminSiteContent';
import { COMMANDER_RANK_BACKDROP_COLORS, DEFAULT_COMMANDER_RANK_BACKDROP_COLOR } from '../utils/commanderImage';

const contextMocks = vi.hoisted(() => ({
    siteContent: { hero: {}, commander: { messages: [] }, overlayImage: {} },
    loading: false,
    error: null,
    saveSiteContent: vi.fn(async () => true),
}));

vi.mock('../context/SiteContentContext', () => ({
    useSiteContent: () => contextMocks,
}));

vi.mock('../context/ConfigProvider', () => ({
    useConfig: () => ({ factoryReset: vi.fn() }),
}));

vi.mock('../context/ThemeContext', () => ({
    useTheme: () => ({ theme: {}, saveTheme: vi.fn(async () => true) }),
}));

vi.mock('./SiteContentLivePreview', () => ({ default: () => null }));

function openCommanderProfileTab() {
    fireEvent.click(screen.getByRole('button', { name: 'פרטי מפקד' }));
}

describe('AdminSiteContent commander image controls', () => {
    afterEach(cleanup);

    it('places the custom photo upload control below source selection and above the rank picker', () => {
        render(<AdminSiteContent />);
        openCommanderProfileTab();

        const sourceHeading = screen.getByText('מקור התמונה');
        const uploadLabel = screen.getByText('העלאת תמונה אישית');
        const rankHeading = screen.getByText('סמל דרגה');

        // Source selection first, then the custom photo upload, then the rank picker.
        expect(sourceHeading.compareDocumentPosition(uploadLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(uploadLabel.compareDocumentPosition(rankHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(uploadLabel.closest('label').nextElementSibling).toContainElement(rankHeading);
    });

    it('renders a resettable set of preset backdrop colors for the rank backdrop', () => {
        render(<AdminSiteContent />);
        openCommanderProfileTab();

        const colorGroup = screen.getByRole('group', { name: 'צבע רקע לדרגה' });
        const namedPresets = COMMANDER_RANK_BACKDROP_COLORS.filter((color) => color.id);
        namedPresets.forEach((preset) => {
            expect(within(colorGroup).getByRole('button', { name: preset.label })).toBeInTheDocument();
        });

        const resetButton = within(colorGroup).getByRole('button', { name: /איפוס/ });
        expect(resetButton).toBeDisabled();

        fireEvent.click(within(colorGroup).getByRole('button', { name: namedPresets[0].label }));
        expect(within(colorGroup).getByRole('button', { name: namedPresets[0].label })).toHaveAttribute('aria-pressed', 'true');
        expect(document.querySelector('[data-rank-picker-backdrop="trigger"]')).toHaveStyle({
            backgroundColor: namedPresets[0].hex,
        });
        expect(document.querySelector('[data-rank-picker-backdrop="trigger"] [data-rank-presentation-surface]'))
            .toHaveAttribute('fill', namedPresets[0].hex);
        expect(resetButton).not.toBeDisabled();

        fireEvent.click(resetButton);
        expect(within(colorGroup).getByRole('button', { name: namedPresets[0].label })).toHaveAttribute('aria-pressed', 'false');
        expect(resetButton).toBeDisabled();
    });
});
