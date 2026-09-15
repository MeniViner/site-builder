import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationAudienceTargets from './NotificationAudienceTargets';

const mocks = vi.hoisted(() => ({
    ensureUserByIdentity: vi.fn(),
    listSharePointGroupMembersByIdentity: vi.fn(),
}));

vi.mock('../services/sharePointSiteCollectionAdminsService', () => ({
    ensureUserByIdentity: mocks.ensureUserByIdentity,
    listSharePointGroupMembersByIdentity: mocks.listSharePointGroupMembersByIdentity,
    normalizeSharePointIdentityInput: (value) => value.trim()
        ? { ok: true, email: value.trim().toLowerCase(), personalNumber: '' }
        : { ok: false, message: 'יש להזין מספר אישי, מייל צבאי או LoginName.' },
}));

vi.mock('../services/adminManagementLogger', () => ({
    mapSharePointErrorToHebrewMessage: () => 'שגיאה בזיהוי משתמש.',
}));

function TargetPickerHarness() {
    const [targets, setTargets] = useState([]);
    return <NotificationAudienceTargets selectedTargets={targets} onSelectedTargetsChange={setTargets} />;
}

describe('NotificationAudienceTargets', () => {
    beforeEach(() => {
        mocks.ensureUserByIdentity.mockReset();
        mocks.listSharePointGroupMembersByIdentity.mockReset();
    });

    it('adds multiple users and expands a SharePoint group into visible member rows', async () => {
        mocks.ensureUserByIdentity.mockResolvedValue({
            Id: 7,
            Title: 'אורי',
            Email: 'uri@army.idf.il',
            LoginName: 'i:0#.f|membership|uri@army.idf.il',
        });
        mocks.listSharePointGroupMembersByIdentity.mockResolvedValue({
            id: 12,
            title: 'צוות מבצעים',
            members: [
                { Id: 17, Title: 'נועה', Email: 'noa@army.idf.il', LoginName: 'i:0#.f|membership|noa@army.idf.il' },
                { Id: 18, Title: 'דנה', Email: 'dana@army.idf.il', LoginName: 'i:0#.f|membership|dana@army.idf.il' },
            ],
        });
        render(<TargetPickerHarness />);

        fireEvent.change(screen.getByRole('textbox', { name: 'מספר אישי / זהות SharePoint' }), {
            target: { value: 'uri@army.idf.il' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'הוסף משתמש' }));
        await screen.findByText('אורי');

        fireEvent.change(screen.getByRole('combobox', { name: 'סוג יעד' }), { target: { value: 'group' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'שם או מזהה קבוצת SharePoint' }), {
            target: { value: 'צוות מבצעים' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'הוסף קבוצה' }));

        await waitFor(() => expect(screen.getByText('נועה')).toBeInTheDocument());
        expect(screen.getByText('דנה')).toBeInTheDocument();
        expect(screen.getAllByText('קבוצה: צוות מבצעים')).toHaveLength(2);
        expect(screen.getByText('3')).toBeInTheDocument();
    });
});