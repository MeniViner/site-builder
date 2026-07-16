import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CategorySection from './CategorySection';

vi.mock('../NavVisual', () => ({
  default: ({ item, icon }) => <span data-testid="nav-visual">{item?.label || item?.title || icon || 'icon'}</span>,
}));

const emptyFolder = {
  id: 'empty-root',
  kind: 'folder',
  label: 'Empty folder',
  url: '',
  children: [],
};

const directNetworkFolder = {
  id: 'network-root',
  kind: 'link',
  label: 'Direct network folder',
  url: 'smb://fileserver/public',
  children: [],
};

const hybridFolder = {
  id: 'hybrid-root',
  kind: 'folder',
  label: 'Hybrid folder',
  url: 'smb://fileserver/root',
  children: [
    {
      id: 'hybrid-child',
      kind: 'folder',
      title: 'Hybrid child',
      url: 'file://fileserver/child',
      subLinks: [
        {
          id: 'nested-network',
          kind: 'link',
          label: 'Nested network folder',
          url: '\\\\fileserver\\public\\nested',
        },
      ],
    },
  ],
};

function renderCategory(cat, regularLinksLayout) {
  return render(
    <CategorySection
      cat={cat}
      regularLinksLayout={regularLinksLayout}
      hqDashBorderStyle="standard"
      flipCardBorderStyle="standard"
      flippedCardId={null}
      onFlip={() => {}}
    />
  );
}

function getNavigationTarget(anchor) {
  const href = anchor.getAttribute('href');
  if (!href?.includes('/__sitebuilder-local-file')) return href;
  return new URL(href, window.location.origin).searchParams.get('href');
}

describe('CategorySection navigation visibility', () => {
  it.each(['grid', 'compact', 'hq'])('keeps empty folders visible in %s mode', (layout) => {
    renderCategory(emptyFolder, layout);

    expect(screen.getAllByText('Empty folder').length).toBeGreaterThan(0);
    expect(screen.getByText('התיקייה ריקה')).toBeInTheDocument();
  });

  it.each(['grid', 'compact', 'hq'])('keeps direct network folders visible and usable in %s mode', (layout) => {
    renderCategory(directNetworkFolder, layout);

    const anchors = screen.getAllByRole('link').filter((anchor) => anchor.getAttribute('href') === 'smb://fileserver/public');
    expect(anchors.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Direct network folder').length).toBeGreaterThan(0);
  });

  it.each(['grid', 'compact', 'hq'])('preserves open and explore actions for hybrid and nested network folders in %s mode', (layout) => {
    renderCategory(hybridFolder, layout);

    expect(screen.getAllByText(/פתח יעד/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hybrid child').length).toBeGreaterThan(0);
    const nestedLink = screen
      .getAllByText('Nested network folder')
      .map((element) => element.closest('a'))
      .find(Boolean);
    expect(getNavigationTarget(nestedLink)).toBe('file://fileserver/public/nested');
  });

  it('uses card click to explore a hybrid while retaining a separate open-target action', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({}));

    function Harness() {
      const [flipped, setFlipped] = useState(null);
      return (
        <CategorySection
          cat={hybridFolder}
          regularLinksLayout="grid"
          hqDashBorderStyle="standard"
          flipCardBorderStyle="standard"
          flippedCardId={flipped}
          onFlip={setFlipped}
        />
      );
    }

    const { container } = render(<Harness />);
    const card = container.querySelector('[data-navigation-card="hybrid-root-hybrid-child"]');
    fireEvent.click(card);

    expect(openSpy).not.toHaveBeenCalled();
    expect(card?.firstElementChild).toHaveClass('[transform:rotateY(180deg)]');
    expect(screen.getAllByRole('link').some((anchor) => getNavigationTarget(anchor) === 'file://fileserver/child')).toBe(true);

    openSpy.mockRestore();
  });
});
