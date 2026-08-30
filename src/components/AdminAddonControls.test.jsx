import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminAddonTabs, AdminAddonToggle } from './AdminAddonControls';

describe('AdminAddonControls', () => {
    it('uses the same accessible active state for addon tabs', () => {
        const onChange = vi.fn();
        render(<AdminAddonTabs tabs={[{ id: 'basic', label: 'בסיס' }, { id: 'tasks', label: 'משימות' }]} activeTab="basic" onChange={onChange} ariaLabel="לשוניות תוספים" />);

        expect(screen.getByRole('tab', { name: 'בסיס' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: 'משימות' }));
        expect(onChange).toHaveBeenCalledWith('tasks');
    });

    it('uses one switch treatment for enabled addon pages', () => {
        const onChange = vi.fn();
        render(<AdminAddonToggle checked={false} onChange={onChange} label="הדף כבוי" ariaLabel="הפעלת תוסף" />);

        fireEvent.click(screen.getByRole('switch', { name: 'הפעלת תוסף' }));
        expect(onChange).toHaveBeenCalledWith(true);
    });
});
