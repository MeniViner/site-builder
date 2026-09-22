import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommanderRankInsignia from './CommanderRankInsignia';
import CommanderRankPicker from './CommanderRankPicker';

function PickerHarness() {
    const [rank, setRank] = useState('אל"ם');
    return <CommanderRankPicker value={rank} styleId="formal" onChange={setRank} />;
}

describe('CommanderRankPicker', () => {
    it('applies a preset color behind rank previews without recoloring the insignia', () => {
        const { container } = render(
            <CommanderRankPicker value="סגן" styleId="formal" backdropColor="crimson" onChange={vi.fn()} />
        );

        const triggerBackdrop = container.querySelector('[data-rank-picker-backdrop="trigger"]');
        const insignia = triggerBackdrop.querySelector('svg[data-rank]');
        expect(triggerBackdrop).toHaveStyle({ backgroundColor: '#dc2626' });
        expect(insignia).not.toHaveStyle({ color: '#dc2626' });

        fireEvent.click(screen.getByRole('button', { name: 'בחירת דרגה' }));
        const optionBackdrop = screen.getByRole('button', { name: 'סגן' })
            .querySelector('[data-rank-picker-backdrop="option"]');
        expect(optionBackdrop).toHaveStyle({ backgroundColor: '#dc2626' });
        expect(optionBackdrop.querySelector('svg[data-rank]')).not.toHaveStyle({ color: '#dc2626' });
    });

    it('shows rank names only inside the selection dialog', () => {
        render(<PickerHarness />);

        expect(screen.queryByText('אל"ם')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'בחירת דרגה' }));
        expect(screen.getByRole('dialog', { name: 'בחירת דרגה' })).toBeInTheDocument();
        expect(screen.getByText('סרן')).toBeInTheDocument();
        expect(screen.queryByText('קצינים אקדמיים')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'קמ"א' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'סרן' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('סרן')).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'סרן, שלושה ארונות' })).toBeInTheDocument();
    });

    it('closes without changing the rank when Escape is pressed', () => {
        const onChange = vi.fn();
        render(<CommanderRankPicker value="סגן" styleId="minimal" onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'בחירת דרגה' }));
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('CommanderRankInsignia', () => {
    it('renders the selected rank using shapes only', () => {
        const { container } = render(<CommanderRankInsignia rank={'רא"ל'} styleId="field" />);

        expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 300 140');
        expect(container.querySelector('svg')).toHaveAttribute('data-rank-style', 'field');
        expect(container.querySelector('text')).not.toBeInTheDocument();
    });
});