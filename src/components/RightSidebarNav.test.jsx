import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RightSidebarNav from './RightSidebarNav';

const mocks = vi.hoisted(() => ({ navItems: [] }));

vi.mock('../context/NavigationContext', () => ({
  useNavigation: () => ({ navItems: mocks.navItems }),
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { borderStyle: 'standard' }, borderTargets: {} }),
}));

vi.mock('./NavVisual', () => ({
  default: ({ item }) => <span aria-hidden="true">{item?.label || item?.title || 'icon'}</span>,
}));

function getNavigationTarget(anchor) {
  const href = anchor.getAttribute('href');
  if (!href?.includes('/__sitebuilder-local-file')) return href;
  return new URL(href, window.location.origin).searchParams.get('href');
}

describe('RightSidebarNav navigation model', () => {
  beforeEach(() => {
    mocks.navItems = [
      { id: 'empty', kind: 'folder', label: 'Empty root', url: '', children: [] },
      { id: 'direct', kind: 'link', label: 'Direct root', url: 'smb://fileserver/direct', children: [] },
      {
        id: 'hybrid',
        kind: 'folder',
        label: 'Hybrid root',
        url: 'file://fileserver/root',
        children: [
          {
            id: 'hybrid-child',
            kind: 'folder',
            title: 'Hybrid child',
            url: 'smb://fileserver/child',
            subLinks: [
              { id: 'nested', kind: 'link', label: 'Nested target', url: '\\\\fileserver\\public\\nested' },
            ],
          },
        ],
      },
    ];
  });

  it('shows empty/direct roots and preserves both actions for hybrid nodes', () => {
    render(<RightSidebarNav />);

    expect(screen.getByRole('button', { name: /Empty root/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Direct root/ })).toHaveAttribute('href', 'smb://fileserver/direct');
    expect(screen.getByTestId('sidebar-flyout-hybrid')).toHaveClass('fixed');

    fireEvent.click(screen.getByRole('button', { name: /Hybrid root/ }));
    expect(getNavigationTarget(screen.getByRole('link', { name: 'פתח יעד' }))).toBe('file://fileserver/root');

    fireEvent.click(screen.getByRole('button', { name: /Hybrid child/ }));
    expect(screen.getByRole('link', { name: 'פתח יעד Hybrid child' })).toHaveAttribute('href', 'smb://fileserver/child');
    const nestedLink = screen
      .getAllByText('Nested target')
      .map((element) => element.closest('a'))
      .find(Boolean);
    expect(getNavigationTarget(nestedLink)).toBe('file://fileserver/public/nested');
  });

  it('shows the native tooltip only when a top-level label is clipped', async () => {
    render(<RightSidebarNav />);

    const clippedFolderLabel = screen.getByTestId('sidebar-trigger-label-hybrid');
    Object.defineProperties(clippedFolderLabel, {
      scrollWidth: { configurable: true, value: 120 },
      clientWidth: { configurable: true, value: 52 },
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Hybrid root/ })).toHaveAttribute('title', 'Hybrid root');
    });
    expect(screen.getByRole('button', { name: /Empty root/ })).not.toHaveAttribute('title');
    expect(screen.getByRole('link', { name: /Direct root/ })).not.toHaveAttribute('title');
  });

  it('uses the same native tooltip behavior for clipped direct links', async () => {
    render(<RightSidebarNav />);

    const clippedLinkLabel = screen.getByTestId('sidebar-trigger-label-direct');
    Object.defineProperties(clippedLinkLabel, {
      scrollHeight: { configurable: true, value: 44 },
      clientHeight: { configurable: true, value: 22 },
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Direct root/ })).toHaveAttribute('title', 'Direct root');
    });
  });
});
