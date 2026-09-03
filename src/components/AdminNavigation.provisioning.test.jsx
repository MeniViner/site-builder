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
    provisionNestedFolder: vi.fn(),
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
    NAVIGATION_COLLISION_CODES: {
        library: 'SHAREPOINT_LIBRARY_ALREADY_EXISTS',
        folder: 'SHAREPOINT_FOLDER_ALREADY_EXISTS',
    },
    buildNavigationProvisionKey: ({ displayName, targetKind, parentBinding }) =>
        `${targetKind}:${parentBinding?.serverRelativeUrl || 'root'}:${displayName.trim()}`,
    default: {
        provisionCategory: mocks.provisionCategory,
        provisionSubcategory: mocks.provisionSubcategory,
        provisionNestedFolder: mocks.provisionNestedFolder,
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

/** Drills from the root into the single category and then into its single subcategory. */
function selectSubcategory() {
    fireEvent.click(screen.getAllByText('קטגוריית בדיקה')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'פתח תיקייה: תכניות עבודה' }));
}

const libraryTarget = {
    url: '/sites/demo/קטגוריית בדיקה',
    targetBinding: {
        version: 1,
        mode: 'sharepoint-auto',
        targetKind: 'library',
        state: 'verified',
        serverRelativeUrl: '/sites/demo/קטגוריית בדיקה',
        listId: 'list-id',
        libraryTitle: 'קטגוריית בדיקה',
        libraryRootServerRelativeUrl: '/sites/demo/קטגוריית בדיקה',
        parentServerRelativeUrl: '',
        physicalName: 'קטגוריית בדיקה',
        provisionKey: 'library:קטגוריית בדיקה',
    },
};

const subcategoryBinding = {
    version: 1,
    mode: 'sharepoint-auto',
    targetKind: 'folder',
    state: 'verified',
    serverRelativeUrl: '/sites/demo/קטגוריית בדיקה/תכניות עבודה',
    listId: 'list-id',
    libraryTitle: 'קטגוריית בדיקה',
    libraryRootServerRelativeUrl: '/sites/demo/קטגוריית בדיקה',
    parentServerRelativeUrl: '/sites/demo/קטגוריית בדיקה',
    physicalName: 'תכניות עבודה',
    provisionKey: 'folder:list-id:/sites/demo/קטגוריית בדיקה:תכניות עבודה',
};

const nestedFolderTarget = {
    url: '/sites/demo/קטגוריית בדיקה/תכניות עבודה/2026',
    targetBinding: {
        ...subcategoryBinding,
        serverRelativeUrl: '/sites/demo/קטגוריית בדיקה/תכניות עבודה/2026',
        parentServerRelativeUrl: '/sites/demo/קטגוריית בדיקה/תכניות עבודה',
        physicalName: '2026',
        provisionKey: 'folder:list-id:/sites/demo/קטגוריית בדיקה/תכניות עבודה:2026',
    },
};

/** Category → subcategory tree whose level-2 node is a verified automatic folder. */
function treeWithVerifiedSubcategory() {
    return [{
        id: 'cat-1',
        label: 'קטגוריית בדיקה',
        kind: 'folder',
        url: libraryTarget.url,
        targetBinding: libraryTarget.targetBinding,
        children: [{
            id: 'sub-1',
            title: 'תכניות עבודה',
            label: 'תכניות עבודה',
            kind: 'folder',
            url: subcategoryBinding.serverRelativeUrl,
            targetBinding: subcategoryBinding,
            subLinks: [],
        }],
    }];
}

describe('AdminNavigation provisioning creation flow', () => {
    beforeEach(() => {
        mocks.navItems = [];
        mocks.saveNavigation.mockReset().mockImplementation(async (updater) => {
            mocks.navItems = typeof updater === 'function' ? updater(mocks.navItems) : updater;
            return true;
        });
        mocks.provisionCategory.mockReset().mockResolvedValue(libraryTarget);
        mocks.provisionSubcategory.mockReset();
        mocks.provisionNestedFolder.mockReset().mockResolvedValue(nestedFolderTarget);
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

    it('only arms an idempotent retry after a failure that actually reached SharePoint', async () => {
        const failure = (mutationAttempted) => Object.assign(new Error('failed'), {
            code: mutationAttempted ? 'FOLDER_VERIFICATION_FAILED' : 'SHAREPOINT_PARENT_FOLDER_NOT_READY',
            userMessage: 'היצירה נכשלה',
            mutationAttempted,
        });

        // A failure that changed nothing must leave the next attempt un-armed, so
        // the service still runs its collision check.
        mocks.provisionCategory.mockRejectedValueOnce(failure(false));
        renderNavigation();
        fireEvent.click(screen.getByRole('button', { name: 'קטגוריה חדשה' }));
        fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'קטגוריית בדיקה' } });
        fireEvent.click(screen.getByRole('button', { name: 'יצירת קטגוריה' }));
        expect(await screen.findByText('היצירה נכשלה')).toBeInTheDocument();

        mocks.provisionCategory.mockRejectedValueOnce(failure(true));
        fireEvent.click(screen.getByRole('button', { name: 'יצירת קטגוריה' }));
        await waitFor(() => expect(mocks.provisionCategory).toHaveBeenCalledTimes(2));
        expect(mocks.provisionCategory.mock.calls[1][0].retryOfProvisionKey).toBe('');

        // The second failure did mutate SharePoint, so the third attempt may retry it.
        fireEvent.click(screen.getByRole('button', { name: 'יצירת קטגוריה' }));
        await waitFor(() => expect(mocks.provisionCategory).toHaveBeenCalledTimes(3));
        expect(mocks.provisionCategory.mock.calls[2][0].retryOfProvisionKey)
            .toBe(mocks.provisionCategory.mock.calls[2][0].provisionKey);
        await waitFor(() => expect(mocks.saveNavigation).toHaveBeenCalledOnce());
    });

    it('retains the existing manual URL/path workflow without invoking SharePoint', async () => {        renderNavigation();
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

    it('provisions a level-3 nested folder inside the selected level-2 folder', async () => {
        mocks.navItems = treeWithVerifiedSubcategory();
        renderNavigation();

        selectSubcategory();
        fireEvent.click(screen.getByRole('button', { name: 'פריט ברמה השלישית' }));
        fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: '2026' } });
        fireEvent.click(screen.getByRole('button', { name: 'יצירת פריט ברמה השלישית' }));

        await waitFor(() => expect(mocks.provisionNestedFolder).toHaveBeenCalledOnce());
        expect(mocks.provisionNestedFolder).toHaveBeenCalledWith(expect.objectContaining({
            displayName: '2026',
            parentBinding: expect.objectContaining({
                targetKind: 'folder',
                serverRelativeUrl: subcategoryBinding.serverRelativeUrl,
                listId: 'list-id',
            }),
        }));
        expect(mocks.provisionSubcategory).not.toHaveBeenCalled();

        await waitFor(() => expect(mocks.saveNavigation).toHaveBeenCalledOnce());
        const createdLink = mocks.navItems[0].children[0].subLinks[0];
        expect(createdLink).toMatchObject({
            label: '2026',
            kind: 'link',
            url: nestedFolderTarget.url,
            targetBinding: nestedFolderTarget.targetBinding,
        });
        // A level-3 item is a leaf: it must not carry another navigation level.
        expect(createdLink.children).toBeUndefined();
        expect(createdLink.subLinks).toBeUndefined();
    });

    it('offers a manual level-3 link when the level-2 parent is not an automatic folder', async () => {
        const tree = treeWithVerifiedSubcategory();
        delete tree[0].children[0].targetBinding;
        tree[0].children[0].url = 'https://intranet.example/plans';
        mocks.navItems = tree;
        renderNavigation();

        selectSubcategory();
        fireEvent.click(screen.getByRole('button', { name: 'פריט ברמה השלישית' }));

        expect(screen.getByRole('radio', { name: /SharePoint אוטומטי/ })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'קישור חיצוני' } });
        fireEvent.change(screen.getByLabelText('כתובת או נתיב קיים'), { target: { value: 'https://example.com/doc' } });
        fireEvent.click(screen.getByRole('button', { name: 'יצירת פריט ברמה השלישית' }));

        await waitFor(() => expect(mocks.saveNavigation).toHaveBeenCalledOnce());
        expect(mocks.provisionNestedFolder).not.toHaveBeenCalled();
        expect(mocks.navItems[0].children[0].subLinks[0]).toMatchObject({
            label: 'קישור חיצוני',
            url: 'https://example.com/doc',
            targetBinding: { mode: 'manual' },
        });
    });

    it('does not expose any way to drill into a level-3 item and create a level 4', async () => {
        const tree = treeWithVerifiedSubcategory();
        tree[0].children[0].subLinks = [{
            id: 'link-1',
            label: '2026',
            kind: 'link',
            url: nestedFolderTarget.url,
            targetBinding: nestedFolderTarget.targetBinding,
        }];
        mocks.navItems = tree;
        renderNavigation();

        selectSubcategory();

        // Level-2 rows expose a drill-in affordance; level-3 rows must not.
        expect(screen.queryByRole('button', { name: /^פתח תיקייה:/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'פריט ברמה השלישית' })).toBeInTheDocument();
    });
});
