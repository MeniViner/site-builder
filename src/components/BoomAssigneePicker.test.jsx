import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BoomAssigneePicker from './BoomAssigneePicker';

const mocks = vi.hoisted(() => ({
    searchSharePointUsers: vi.fn(),
}));

vi.mock('../services/sharePointSiteCollectionAdminsService', () => ({
    searchSharePointUsers: mocks.searchSharePointUsers,
}));

function PickerHarness() {
    const [assignee, setAssignee] = useState(null);
    return (
        <div className="relative">
            <span>{assignee ? `אחראי נבחר: ${assignee.displayName}` : 'לא נבחר אחראי'}</span>
            <BoomAssigneePicker linkedAssignee={assignee} onAssigneeChange={setAssignee} />
        </div>
    );
}

describe('BoomAssigneePicker', () => {
    beforeEach(() => {
        mocks.searchSharePointUsers.mockReset();
    });

    it('searches SharePoint users and replaces the selected single assignee', async () => {
        mocks.searchSharePointUsers.mockImplementation(async (query) => (
            query === 'נועה'
                ? [{ Id: 17, Title: 'נועה', Email: 'noa@army.idf.il', LoginName: 'i:0#.f|membership|noa@army.idf.il' }]
                : [{ Id: 18, Title: 'דנה', Email: 'dana@army.idf.il', LoginName: 'i:0#.f|membership|dana@army.idf.il' }]
        ));
        render(<PickerHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'נועה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /נועה/ }));
        expect(screen.getByText('אחראי נבחר: נועה')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'בחירת אחראי משימה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש אחראי משימה' }), { target: { value: 'דנה' } });
        fireEvent.click(screen.getByRole('button', { name: 'חיפוש' }));
        fireEvent.click(await screen.findByRole('button', { name: /דנה/ }));
        expect(screen.getByText('אחראי נבחר: דנה')).toBeInTheDocument();
        expect(screen.queryByText('אחראי נבחר: נועה')).not.toBeInTheDocument();
    });
});