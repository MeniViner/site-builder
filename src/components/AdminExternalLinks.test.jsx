import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminExternalLinks from './AdminExternalLinks';

const mocks = vi.hoisted(() => ({
    links: [],
    uploadImage: vi.fn(),
    saveExternalLinks: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('../context/ExternalLinksContext', () => ({
    useExternalLinks: () => ({
        externalLinks: mocks.links,
        loading: false,
        error: null,
        saving: false,
        dirty: false,
        retrySave: vi.fn(),
        saveExternalLinks: mocks.saveExternalLinks,
    }),
}));

vi.mock('../utils/sharepointUtils', () => ({
    uploadImage: mocks.uploadImage,
}));

vi.mock('react-toastify', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('./IconPickerModal', () => ({
    default: () => null,
}));

vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => null,
    HelpLabel: ({ children }) => <label>{children}</label>,
    HelpTooltipButton: () => null,
}));

const sharePointImage = '/sites/test-site/siteDB/images/ExternalLinks/badge.png';

function renderAdmin() {
    return render(
        <MemoryRouter>
            <AdminExternalLinks />
        </MemoryRouter>,
    );
}

function addImageLink() {
    fireEvent.click(screen.getByRole('button', { name: 'הוסף קישור' }));
    fireEvent.click(screen.getByRole('button', { name: /תמונה מותאמת/ }));
}

describe('AdminExternalLinks custom image upload', () => {
    beforeEach(() => {
        mocks.links = [];
        mocks.uploadImage.mockReset();
        mocks.saveExternalLinks.mockReset();
        mocks.toastSuccess.mockReset();
        mocks.toastError.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('uploads to ExternalLinks, selects image mode, clears the Lucide icon and previews immediately', async () => {
        mocks.uploadImage.mockResolvedValue(sharePointImage);
        renderAdmin();
        addImageLink();

        const file = new File(['image'], 'badge.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('העלה תמונה'), { target: { files: [file] } });

        await waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledWith(file, 'ExternalLinks'));
        const preview = await screen.findByAltText('תצוגה מקדימה');
        expect(preview).toHaveAttribute('src', sharePointImage);
        expect(mocks.toastSuccess).toHaveBeenCalledWith('התמונה הועלתה ומוצגת בתצוגה המקדימה.');

        fireEvent.change(screen.getByPlaceholderText('לדוגמה: "פורטל מילואים"'), { target: { value: 'פורטל' } });
        fireEvent.change(screen.getByPlaceholderText(/https:\/\/example\.idf\.il/), { target: { value: 'https://portal.example' } });
        fireEvent.click(screen.getByRole('button', { name: 'הוסף' }));

        await waitFor(() => expect(mocks.saveExternalLinks).toHaveBeenCalledOnce());
        const saved = mocks.saveExternalLinks.mock.calls[0][0]([]);
        expect(saved).toEqual([{
            id: expect.any(String),
            title: 'פורטל',
            url: 'https://portal.example/',
            icon: '',
            iconUrl: sharePointImage,
        }]);
    });

    it('preserves the existing preview when a replacement upload fails', async () => {
        mocks.links = [{
            id: 'portal',
            title: 'פורטל',
            url: 'https://portal.example',
            icon: '',
            iconUrl: sharePointImage,
        }];
        mocks.uploadImage.mockRejectedValue(new Error('אין הרשאה להעלות תמונה'));
        renderAdmin();

        fireEvent.click(screen.getByRole('button', { name: 'ערוך' }));
        expect(screen.getByAltText('תצוגה מקדימה')).toHaveAttribute('src', sharePointImage);
        fireEvent.change(screen.getByLabelText('החלף תמונה'), {
            target: { files: [new File(['replacement'], 'badge.png', { type: 'image/png' })] },
        });

        await waitFor(() => expect(mocks.toastError)
            .toHaveBeenCalledWith('שגיאה בהעלאת תמונה: אין הרשאה להעלות תמונה'));
        expect(screen.getByAltText('תצוגה מקדימה')).toHaveAttribute('src', sharePointImage);
    });

    it('clears the custom image when the user intentionally saves the Lucide visual mode', async () => {
        mocks.links = [{
            id: 'portal',
            title: 'פורטל',
            url: 'https://portal.example',
            icon: '',
            iconUrl: sharePointImage,
        }];
        renderAdmin();

        fireEvent.click(screen.getByRole('button', { name: 'ערוך' }));
        fireEvent.click(screen.getByRole('button', { name: /^אייקון$/ }));
        fireEvent.change(screen.getByPlaceholderText('לדוגמה: "פורטל מילואים"'), { target: { value: 'פורטל' } });
        fireEvent.click(screen.getByRole('button', { name: 'שמור' }));

        await waitFor(() => expect(mocks.saveExternalLinks).toHaveBeenCalledOnce());
        const saved = mocks.saveExternalLinks.mock.calls[0][0](mocks.links);
        expect(saved[0]).toMatchObject({ iconUrl: '', icon: '' });
    });
});
