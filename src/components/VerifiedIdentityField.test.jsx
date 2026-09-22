import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifiedIdentityField from './VerifiedIdentityField';

const mocks = vi.hoisted(() => ({
    resolveExactSharePointIdentity: vi.fn(),
}));

vi.mock('../services/sharePointIdentityResolver', () => ({
    resolveExactSharePointIdentity: mocks.resolveExactSharePointIdentity,
}));

vi.mock('../services/sharePointSiteCollectionAdminsService', () => ({
    normalizeSharePointIdentityInput: (value) => (value.trim()
        ? { ok: true, email: value.trim().toLowerCase(), personalNumber: '', label: value.trim() }
        : { ok: false, message: 'יש להזין מספר אישי, מייל צבאי או LoginName.' }),
}));

function FieldHarness() {
    const [identityInput, setIdentityInput] = useState('s1234567');
    const [linkedUser, setLinkedUser] = useState(null);
    return (
        <VerifiedIdentityField
            identityInput={identityInput}
            linkedUser={linkedUser}
            onIdentityChange={setIdentityInput}
            onLinkedUserChange={setLinkedUser}
        />
    );
}

describe('VerifiedIdentityField', () => {
    beforeEach(() => {
        mocks.resolveExactSharePointIdentity.mockReset();
    });

    it('links a single confirmed SharePoint user via the shared exact identity resolver', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: true,
            principal: {
                identityKey: 'sp:17',
                identities: ['sp:17'],
                displayName: 'נועה כהן',
                sharePointUserId: 17,
                loginName: 'i:0#.f|membership|s1234567@army.idf.il',
                email: 's1234567@army.idf.il',
            },
        });
        render(<FieldHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בדוק זיהוי' }));

        await waitFor(() => expect(screen.getByText(/זהות אומתה: נועה כהן/)).toBeInTheDocument());
        expect(mocks.resolveExactSharePointIdentity).toHaveBeenCalledWith('s1234567', expect.any(Array));
    });

    it('shows a safe Hebrew error and clears the linked user when the resolver rejects a group/ambiguous/stale response', async () => {
        mocks.resolveExactSharePointIdentity.mockResolvedValue({
            ok: false,
            error: 'ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.',
        });
        render(<FieldHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בדוק זיהוי' }));

        await waitFor(() => expect(screen.getByText('ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.')).toBeInTheDocument());
        expect(screen.queryByText(/זהות אומתה/)).not.toBeInTheDocument();
    });
});
