import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BoomAssigneePicker from './BoomAssigneePicker';

const mocks = vi.hoisted(() => ({
    searchSharePointIdentityCandidates: vi.fn(),
    resolveExactSharePointIdentity: vi.fn(),
    resolveConfirmedSinglePrincipalFromCandidate: vi.fn(),
}));

vi.mock('../services/sharePointIdentityResolver', () => ({
    isExactSharePointIdentityInput: (value) => /^\d{6,8}$/.test(value)
        || /^s\d{6,8}$/i.test(value)
        || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        || /[|\\]/.test(value)
        || /^[ic]:/i.test(value),
    isConfirmedUserPrincipal: (candidate) => Number(candidate?.Id) > 0 && Number(candidate?.PrincipalType ?? 1) === 1,
    resolveExactSharePointIdentity: mocks.resolveExactSharePointIdentity,
    resolveConfirmedSinglePrincipalFromCandidate: mocks.resolveConfirmedSinglePrincipalFromCandidate,
    searchSharePointIdentityCandidates: mocks.searchSharePointIdentityCandidates,
}));

function PickerHarness({ initialAssignee = null, taskKey = 'task-1' }) {
    const [assignee, setAssignee] = useState(initialAssignee);
    return (
        <div className="relative">
            <span>{assignee ? `אחראי נבחר: ${assignee.displayName}` : 'לא נבחר אחראי'}</span>
            <BoomAssigneePicker taskKey={taskKey} linkedAssignee={assignee} onAssigneeChange={setAssignee} />
        </div>
    );
}

function deferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('BoomAssigneePicker', () => {
    beforeEach(() => {
        mocks.searchSharePointIdentityCandidates.mockReset();
        mocks.resolveExactSharePointIdentity.mockReset();
        mocks.resolveConfirmedSinglePrincipalFromCandidate.mockReset();
    });

    it('resolves a personal number directly before running the limited name search', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: true,
            principal: {
                identityKey: 'sp:44',
                identities: ['sp:44', 'pn:1234567'],
                displayName: 'רוני',
                sharePointUserId: 44,
                personalNumber: '1234567',
            },
        });
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: '1234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));

        await waitFor(() => expect(screen.getByText('אחראי נבחר: רוני')).toBeInTheDocument());
        expect(mocks.resolveExactSharePointIdentity).toHaveBeenCalledWith('1234567', []);
        expect(mocks.searchSharePointIdentityCandidates).not.toHaveBeenCalled();
    });

    it('is usable after exact resolution closes and the picker is reopened', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: true,
            principal: {
                identityKey: 'sp:44',
                identities: ['sp:44', 'pn:1234567'],
                displayName: 'רוני',
                sharePointUserId: 44,
                personalNumber: '1234567',
            },
        });
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: '1234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'בחירת אחראי משימה' })).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'חיפוש' })).toBeEnabled();
    });

    it('cancels a pending search and reopens with an enabled empty picker', async () => {
        const pendingSearch = deferred();
        mocks.searchSharePointIdentityCandidates.mockReturnValue(pendingSearch.promise);
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'נועה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'סגירת בחירת אחראי' }));

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toBeEnabled();
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toHaveValue('');

        pendingSearch.resolve({
            ok: true,
            candidates: [{ Id: 17, Title: 'נועה', PrincipalType: 1 }],
        });
        await Promise.resolve();
        expect(screen.queryByRole('button', { name: /נועה/ })).not.toBeInTheDocument();
    });

    it('ignores a late exact response after a new query starts', async () => {
        const pendingResolution = deferred();
        mocks.resolveExactSharePointIdentity.mockReturnValue(pendingResolution.promise);
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: '1234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'נועה' } });
        pendingResolution.resolve({
            ok: true,
            principal: { identityKey: 'sp:44', identities: ['sp:44'], displayName: 'רוני', sharePointUserId: 44 },
        });

        await Promise.resolve();
        expect(screen.getByText('לא נבחר אחראי')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toHaveValue('נועה');
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toBeEnabled();
    });

    it('keeps the picker retryable after exact resolution failure', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: false,
            error: 'לא ניתן לזהות משתמש מאומת יחיד עבור הערך שהוזן.',
        });
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: '1234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));

        await screen.findByText('לא ניתן לזהות משתמש מאומת יחיד עבור הערך שהוזן.');
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'חיפוש' })).toBeEnabled();
    });

    it('invalidates pending work and clears busy state when the task changes', async () => {
        const pendingSearch = deferred();
        mocks.searchSharePointIdentityCandidates.mockReturnValue(pendingSearch.promise);
        const { rerender } = render(<PickerHarness taskKey="task-1" />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'נועה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        rerender(<PickerHarness taskKey="task-2" />);

        expect(screen.queryByRole('dialog', { name: 'בחירת אחראי משימה' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toBeEnabled();
        expect(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' })).toHaveValue('');
        pendingSearch.resolve({
            ok: true,
            candidates: [{ Id: 17, Title: 'נועה', PrincipalType: 1 }],
        });
        await Promise.resolve();
        expect(screen.queryByRole('button', { name: /נועה/ })).not.toBeInTheDocument();
    });

    it('preserves stable aliases and personal-number metadata in the linked assignee', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: true,
            principal: {
                identityKey: 'sp:44',
                identities: ['sp:44', 'pn:1234567'],
                displayName: 'רוני',
                sharePointUserId: 44,
                personalNumber: '1234567',
            },
        });
        const onAssigneeChange = vi.fn();
        render(<BoomAssigneePicker taskKey="task-1" linkedAssignee={null} onAssigneeChange={onAssigneeChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: '1234567' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));

        await waitFor(() => expect(onAssigneeChange).toHaveBeenCalledWith(expect.objectContaining({
            identityKey: 'sp:44',
            identities: ['sp:44', 'pn:1234567'],
            personalNumber: '1234567',
        })));
    });

    it('searches SharePoint users, performs an explicit final resolve, and replaces the selected single assignee', async () => {
        mocks.searchSharePointIdentityCandidates.mockImplementation(async (query) => ({
            ok: true,
            candidates: query === 'נועה'
                ? [{ Id: 17, Title: 'נועה', Email: 'noa@army.idf.il', LoginName: 'i:0#.f|membership|noa@army.idf.il', PrincipalType: 1 }]
                : [{ Id: 18, Title: 'דנה', Email: 'dana@army.idf.il', LoginName: 'i:0#.f|membership|dana@army.idf.il', PrincipalType: 1 }],
        }));
        mocks.resolveConfirmedSinglePrincipalFromCandidate.mockImplementation(async (candidate) => ({
            ok: true,
            principal: {
                identityKey: `sp:${candidate.Id}`,
                identities: [`sp:${candidate.Id}`],
                displayName: candidate.Title,
                sharePointUserId: candidate.Id,
                loginName: candidate.LoginName,
                email: candidate.Email,
            },
        }));
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'נועה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /נועה/ }));
        await waitFor(() => expect(screen.getByText('אחראי נבחר: נועה')).toBeInTheDocument());
        expect(mocks.resolveConfirmedSinglePrincipalFromCandidate).toHaveBeenCalledWith(
            expect.objectContaining({ Id: 17 }),
            expect.any(Array)
        );

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'דנה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /דנה/ }));
        await waitFor(() => expect(screen.getByText('אחראי נבחר: דנה')).toBeInTheDocument());
        expect(screen.queryByText('אחראי נבחר: נועה')).not.toBeInTheDocument();
    });

    it('rejects a stale/ambiguous result on final resolve and shows a safe Hebrew error without selecting an assignee', async () => {
        mocks.searchSharePointIdentityCandidates.mockResolvedValue({
            ok: true,
            candidates: [{ Id: 17, Title: 'נועה', Email: 'noa@army.idf.il', LoginName: 'i:0#.f|membership|noa@army.idf.il', PrincipalType: 1 }],
        });
        mocks.resolveConfirmedSinglePrincipalFromCandidate.mockResolvedValue({
            ok: false,
            error: 'SharePoint לא הצליח לזהות את המשתמש לפי הערך שהוזן. נסה מספר אישי, מייל צבאי מלא או LoginName כפי שהוא מופיע ב-SharePoint.',
        });
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'נועה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /נועה/ }));

        await waitFor(() => expect(screen.getByText(/SharePoint לא הצליח לזהות את המשתמש/)).toBeInTheDocument());
        expect(screen.getByText('לא נבחר אחראי')).toBeInTheDocument();
    });

    it('retains the existing owner when a replacement candidate fails final resolution', async () => {
        mocks.searchSharePointIdentityCandidates.mockResolvedValue({
            ok: true,
            candidates: [{ Id: 18, Title: 'דנה', Email: 'dana@army.idf.il', LoginName: 'i:0#.f|membership|dana@army.idf.il', PrincipalType: 1 }],
        });
        mocks.resolveConfirmedSinglePrincipalFromCandidate.mockResolvedValue({
            ok: false,
            error: 'תוצאת החיפוש אינה עדכנית. חפשו את המשתמש מחדש ובחרו שוב.',
        });
        render(<PickerHarness initialAssignee={{ identityKey: 'sp:17', displayName: 'נועה' }} />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'דנה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /דנה/ }));

        await waitFor(() => expect(screen.getByText('תוצאת החיפוש אינה עדכנית. חפשו את המשתמש מחדש ובחרו שוב.')).toBeInTheDocument());
        expect(screen.getByText('אחראי נבחר: נועה')).toBeInTheDocument();
    });

    it('rejects a group principal returned from search without an explicit final resolve call', async () => {
        mocks.searchSharePointIdentityCandidates.mockResolvedValue({
            ok: true,
            candidates: [{ Id: 9, Title: 'קבוצת מבצעים', LoginName: 'ops-group', PrincipalType: 8 }],
        });
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'מבצעים' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /קבוצת מבצעים/ }));

        await waitFor(() => expect(screen.getByText('ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.')).toBeInTheDocument());
        expect(mocks.resolveConfirmedSinglePrincipalFromCandidate).not.toHaveBeenCalled();
        expect(screen.getByText('לא נבחר אחראי')).toBeInTheDocument();
    });
});