import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RightSidebarNav from './RightSidebarNav';
import { decodeFileExplorerTarget } from '../utils/fileExplorerTargets';

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
  if (!href?.includes('/file-explorer?target=')) return href;
  const token = new URLSearchParams(href.split('?')[1]).get('target');
  return decodeFileExplorerTarget(token)?.canonicalPath || href;
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
    expect(getNavigationTarget(screen.getByRole('link', { name: /Direct root/ }))).toBe('\\\\fileserver\\direct');
    expect(screen.getByTestId('sidebar-flyout-hybrid')).toHaveClass('fixed');

    fireEvent.click(screen.getByRole('button', { name: /Hybrid root/ }));
    expect(getNavigationTarget(screen.getByRole('link', { name: 'פתח יעד' }))).toBe('\\\\fileserver\\root');

    fireEvent.click(screen.getByRole('button', { name: /Hybrid child/ }));
    expect(getNavigationTarget(screen.getByRole('link', { name: 'פתח יעד Hybrid child' }))).toBe('\\\\fileserver\\child');
    const nestedLink = screen
      .getAllByText('Nested target')
      .map((element) => element.closest('a'))
      .find(Boolean);
    expect(getNavigationTarget(nestedLink)).toBe('\\\\fileserver\\public\\nested');
  });

  it('uses the four-layer rail and closes a fixed flyout when its trigger list scrolls', async () => {
    render(<RightSidebarNav />);

    const rail = document.querySelector('.right-sidebar-nav');
    const viewport = document.querySelector('.right-sidebar-nav__viewport');
    const scroller = document.querySelector('.right-sidebar-nav__scroll');
    const group = document.querySelector('.right-sidebar-nav__group');
    expect(rail).toContainElement(viewport);
    expect(viewport).toContainElement(scroller);
    expect(scroller).toContainElement(group);

    fireEvent.click(screen.getByRole('button', { name: /Hybrid root/ }));
    expect(screen.getByTestId('sidebar-flyout-hybrid')).toHaveClass('visible');

    fireEvent.scroll(scroller);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-flyout-hybrid')).toHaveClass('invisible');
    });
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
