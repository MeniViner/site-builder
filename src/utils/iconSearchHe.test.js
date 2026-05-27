import { describe, expect, it } from 'vitest';
import {
    getIconSearchHaystack,
    normalizeIconSearchText,
    searchIconNames,
    searchIcons,
} from './iconSearchHe';
import { ICON_CATEGORIES } from './iconsData';

describe('iconSearch utilities', () => {
    it('normalizes multilingual search text', () => {
        expect(normalizeIconSearchText('  Café-משתמשים  ')).toBe('cafe משתמשימ');
    });

    it('preserves existing raw haystack compatibility', () => {
        const haystack = getIconSearchHaystack('Users');

        expect(haystack).toContain('משתמשים');
        expect(haystack).toContain('users');
    });

    it('searches by english, hebrew, and category metadata while returning existing icon names', () => {
        expect(searchIconNames('phone')[0]).toBe('Phone');
        expect(searchIconNames('טלפון')).toContain('Phone');
        expect(searchIconNames('מייל')).toContain('Mail');
        expect(searchIconNames('חייל')).toEqual(expect.arrayContaining(['Shield', 'Swords']));

        const communicationResults = searchIcons('תקשורת', { limit: 10 });
        expect(communicationResults.some((icon) => icon.categoryId === 'communication')).toBe(true);
        expect(communicationResults.every((icon) => typeof icon.name === 'string')).toBe(true);
    });

    it('supports custom category/icon subsets', () => {
        const customCategories = [
            { id: 'custom', label: 'בדיקה', icons: ['Rocket', 'Home'] },
        ];

        expect(searchIconNames('בית', { categories: customCategories })).toEqual(['Home']);
        expect(searchIconNames('', { categories: ICON_CATEGORIES, iconNames: ['Home', 'Search'] })).toEqual(['Home', 'Search']);
    });
});
