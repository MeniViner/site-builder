import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminNavigation from './AdminNavigation';

const mocks = vi.hoisted(() => ({
    navItems: [],
    saveNavigation: vi.fn(),
    provisionCategory: vi.fn(),
    provisionSubcategory: vi.fn(),
}));

vi.mock('../context/NavigationContext', () => ({
    useNavigation: () => ({
        navItems: mocks.navItems,
        loading: false,
        error: null,
        saving: false,
        dirty: false,
        retrySave: vi.fn(),
        saveNavigation: mocks.saveNavigation,
    }),
}));

vi.mock('../context/ThemeContext', () => ({
    useTheme: () => ({ effectiveMode: 'light' }),
}));

vi.mock('../services/NavigationSharePointService', () => ({
    buildNavigationProvisionKey: ({ displayName, targetKind, parentBinding }) =>
        `${targetKind}:${parentBinding?.listId || 'root'}:${displayName.trim()}`,
    default: {
        provisionCategory: mocks.provisionCategory,
        provisionSubcategory: mocks.provisionSubcategory,
    },
}));

vi.mock('./NavVisual', () => ({ default: () => <span data-testid="nav-visual" /> }));
vi.mock('./IconPickerModal', () => ({ default: () => null }));
vi.mock('./Tooltip', () => ({ default: ({ children }) => children }));
vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => null,
    HelpTooltipButton: () => null,
    HelpLabel: ({ children }) => <span>{children}</span>,
}));
vi.mock('../utils/sharepointUtils', () => ({ uploadImage: vi.fn() }));

function renderNavigation() {
    return render(<MemoryRouter><AdminNavigation /></MemoryRouter>);
}

const libraryTarget = {
    url: '/sites/demo/category-library-abc1234',
    targetBinding: {
        version: 1,
        mode: 'sharepoint-auto',
        targetKind: 'library',
        state: 'verified',
        serverRelativeUrl: '/sites/demo/category-library-abc1234',
        listId: 'list-id',
        libraryTitle: 'קטגוריית בדיקה',
        libraryRootServerRelativeUrl: '/sites/demo/category-library-abc1234',
        provisionKey: 'node-id',
    },
};

describe('AdminNavigation provisioning creation flow', () => {
    beforeEach(() => {
        mocks.navItems = [];
        mocks.saveNavigation.mockReset().mockImplementation(async (updater) => {
            mocks.navItems = typeof updater === 'function' ? updater(mocks.navItems) : updater;
            return true;
        });
        mocks.provisionCategory.mockReset().mockResolvedValue(libraryTarget);
        mocks.provisionSubcategory.mockReset();
    });

    it('provisions and verifies an automatic category before persisting its navigation node', async () => {
        renderNavigation();
        fireEvent.click(screen.getByRole('button', { name: 'קטגוריה חדשה' }));
        fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'קטגוריית בדיקה' } });
        fireEvent.click(screen.getByRole('button', { name: 'יצירת קטגוריה' }));

        await waitFor(() => expect(mocks.provisionCategory).toHaveBeenCalledOnce());
        await waitFor(() => expect(mocks.saveNavigation).toHaveBeenCalledOnce());
        expect(mocks.provisionCategory.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.saveNavigation.mock.invocationCallOrder[0]
        );
        expect(mocks.navItems[0]).toMatchObject({
            label: 'קטגוריית בדיקה',
            url: libraryTarget.url,
            targetBinding: libraryTarget.targetBinding,
        });
    });

    it('keeps the user input and never persists a false-success node after SharePoint failure', async () => {
        mocks.provisionCategory.mockRejectedValue(Object.assign(new Error('Forbidden'), {
            userMessage: 'נדרשת הרשאת יצירה ב-SharePoint',
        }));
        renderNavigation();
        fireEvent.click(screen.getByRole('button', { name: 'קטגוריה חדשה' }));
        fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'קטגוריה שלא נוצרה' } });
        fireEvent.click(screen.getByRole('button', { name: 'יצירת קטגוריה' }));

        expect(await screen.findByText('נדרשת הרשאת יצירה ב-SharePoint')).toBeInTheDocument();
        expect(screen.getByLabelText('שם תצוגה')).toHaveValue('קטגוריה שלא נוצרה');
        expect(mocks.saveNavigation).not.toHaveBeenCalled();
        expect(mocks.navItems).toEqual([]);
    });

    it('retains the existing manual URL/path workflow without invoking SharePoint', async () => {
        renderNavigation();
        fireEvent.click(screen.getByRole('button', { name: 'קטגוריה חדשה' }));
        fireEvent.click(screen.getByRole('radio', { name: /יעד קיים \/ ידני/ }));
        fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'שרת קבצים' } });
        fireEvent.change(screen.getByLabelText('כתובת או נתיב קיים'), { target: { value: 'smb://server/share' } });
        fireEvent.click(screen.getByRole('button', { name: 'יצירת קטגוריה' }));

        await waitFor(() => expect(mocks.saveNavigation).toHaveBeenCalledOnce());
        expect(mocks.provisionCategory).not.toHaveBeenCalled();
        expect(mocks.navItems[0]).toMatchObject({
            label: 'שרת קבצים',
            url: 'smb://server/share',
            targetBinding: { mode: 'manual', targetKind: 'url', state: 'manual' },
        });
    });
});
