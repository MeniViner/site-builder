import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExtLinksCards, ExtLinksFloating, ExtLinksMinimal } from './ExternalLinksLayouts';

const imageUrl = '/sites/test-site/siteDB/images/ExternalLinks/badge.png';
const links = [{
    id: 'portal',
    title: 'פורטל',
    url: 'https://portal.example',
    icon: '',
    iconUrl: imageUrl,
}];

describe('External Links image visuals', () => {
    it.each([
        ['cards', () => <ExtLinksCards links={links} />],
        ['minimal', () => <ExtLinksMinimal links={links} />],
        ['floating', () => <ExtLinksFloating links={links} fixed={false} />],
    ])('renders a persisted custom image in the %s layout', (_layout, renderLayout) => {
        render(renderLayout());
        expect(screen.getByRole('img', { name: 'פורטל' })).toHaveAttribute('src', imageUrl);
    });
});
