import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationAudienceTargets from './NotificationAudienceTargets';

const mocks = vi.hoisted(() => ({
    resolveExactSharePointIdentity: vi.fn(),
    listSharePointGroupMembersByIdentity: vi.fn(),
}));

vi.mock('../services/sharePointSiteCollectionAdminsService', () => ({
    listSharePointGroupMembersByIdentity: mocks.listSharePointGroupMembersByIdentity,
    normalizeSharePointIdentityInput: (value) => value.trim()
        ? { ok: true, email: value.trim().toLowerCase(), personalNumber: '' }
        : { ok: false, message: 'יש להזין מספר אישי, מייל צבאי או LoginName.' },
}));

vi.mock('../services/sharePointIdentityResolver', () => ({
    isConfirmedUserPrincipal: (candidate) => Number(candidate?.Id) > 0 && Number(candidate?.PrincipalType ?? 1) === 1,
    resolveExactSharePointIdentity: mocks.resolveExactSharePointIdentity,
}));

function TargetPickerHarness() {
    const [targets, setTargets] = useState([]);
    return <NotificationAudienceTargets selectedTargets={targets} onSelectedTargetsChange={setTargets} />;
}

describe('NotificationAudienceTargets', () => {
    beforeEach(() => {
        mocks.resolveExactSharePointIdentity.mockReset();
        mocks.listSharePointGroupMembersByIdentity.mockReset();
    });

    it('adds multiple users and expands a SharePoint group into visible member rows', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: true,
            principal: {
                identityKey: 'sp:7',
                identities: ['sp:7'],
                displayName: 'אורי',
                sharePointUserId: 7,
                loginName: 'i:0#.f|membership|uri@army.idf.il',
                email: 'uri@army.idf.il',
            },
        });
        mocks.listSharePointGroupMembersByIdentity.mockResolvedValue({
            id: 12,
            title: 'צוות מבצעים',
            members: [
                { Id: 17, Title: 'נועה', Email: 'noa@army.idf.il', LoginName: 'i:0#.f|membership|noa@army.idf.il', PrincipalType: 1 },
                { Id: 18, Title: 'דנה', Email: 'dana@army.idf.il', LoginName: 'i:0#.f|membership|dana@army.idf.il', PrincipalType: 1 },
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

    it('rejects adding a user target that resolves to a group with a safe Hebrew error', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: false,
            error: 'ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.',
        });
        render(<TargetPickerHarness />);

        fireEvent.change(screen.getByRole('textbox', { name: 'מספר אישי / זהות SharePoint' }), {
            target: { value: 'ops-group' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'הוסף משתמש' }));

        await waitFor(() => expect(screen.getByText('ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.')).toBeInTheDocument());
        expect(screen.queryByText('משתמשים שנבחרו')).not.toBeInTheDocument();
    });

    it('filters nested group principals out of a resolved group member list', async () => {
        mocks.listSharePointGroupMembersByIdentity.mockResolvedValue({
            id: 12,
            title: 'צוות מבצעים',
            members: [
                { Id: 17, Title: 'נועה', Email: 'noa@army.idf.il', LoginName: 'i:0#.f|membership|noa@army.idf.il', PrincipalType: 1 },
                { Id: 9, Title: 'תת-קבוצה מקוננת', LoginName: 'nested-group', PrincipalType: 8 },
            ],
        });
        render(<TargetPickerHarness />);

        fireEvent.change(screen.getByRole('combobox', { name: 'סוג יעד' }), { target: { value: 'group' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'שם או מזהה קבוצת SharePoint' }), {
            target: { value: 'צוות מבצעים' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'הוסף קבוצה' }));

        await waitFor(() => expect(screen.getByText('נועה')).toBeInTheDocument());
        expect(screen.queryByText('תת-קבוצה מקוננת')).not.toBeInTheDocument();
        expect(screen.getAllByText('קבוצה: צוות מבצעים')).toHaveLength(1);
    });
});