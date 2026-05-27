import { describe, expect, it } from 'vitest';
import {
    classifySmartLink,
    createSmartTextLinkToken,
    findSmartLinkMatches,
    insertSmartTextLinkToken,
    isConservativePhoneNumber,
    normalizeSmartLinkInput,
    SMART_LINK_TYPES,
    tokenizeSmartText,
} from './smartText';

describe('smartText', () => {
    it('classifies http and https urls', () => {
        expect(classifySmartLink('https://example.com')).toMatchObject({
            type: SMART_LINK_TYPES.url,
            href: 'https://example.com/',
        });
    });

    it('classifies www urls', () => {
        expect(classifySmartLink('www.example.com')).toMatchObject({
            type: SMART_LINK_TYPES.url,
            href: 'https://www.example.com/',
        });
    });

    it('classifies email addresses', () => {
        expect(classifySmartLink('user@example.com')).toMatchObject({
            type: SMART_LINK_TYPES.email,
            href: 'mailto:user@example.com',
        });
    });

    it('classifies mailto links', () => {
        expect(classifySmartLink('mailto:user@example.com')).toMatchObject({
            type: SMART_LINK_TYPES.email,
            href: 'mailto:mailto:user@example.com',
        });
    });

    it('classifies phone numbers conservatively', () => {
        expect(isConservativePhoneNumber('0501234567')).toBe(true);
        expect(isConservativePhoneNumber('+972 50 123 4567')).toBe(true);
        expect(classifySmartLink('050-123-4567')).toMatchObject({
            type: SMART_LINK_TYPES.phone,
            href: 'tel:0501234567',
        });
        expect(isConservativePhoneNumber('2026-05-24')).toBe(false);
    });

    it('detects S personal numbers', () => {
        expect(classifySmartLink('S1234567')).toMatchObject({
            type: SMART_LINK_TYPES.personalNumber,
            href: 'mailto:S1234567@army.idf.il',
            text: 'S1234567',
        });
    });

    it('detects C personal numbers', () => {
        expect(classifySmartLink('C1234567')).toMatchObject({
            type: SMART_LINK_TYPES.personalNumber,
            href: 'mailto:C1234567@army.idf.il',
            text: 'C1234567',
        });
    });

    it('normalizes lowercase s/c personal numbers', () => {
        expect(classifySmartLink('s1234567')).toMatchObject({
            href: 'mailto:S1234567@army.idf.il',
            text: 'S1234567',
        });
        expect(classifySmartLink('c12345678')).toMatchObject({
            href: 'mailto:C12345678@army.idf.il',
            text: 'C12345678',
        });
    });

    it('does not match invalid personal numbers', () => {
        expect(classifySmartLink('S123456')).toBeNull();
        expect(classifySmartLink('S123456789')).toBeNull();
        expect(classifySmartLink('A1234567')).toBeNull();
        expect(findSmartLinkMatches('S123456 S123456789 A1234567')).toEqual([]);
    });

    it('tokenizes plain text, line breaks, labels, and smart links without raw html', () => {
        const tokens = tokenizeSmartText(
            'See www.example.com\nmail user@example.com and s1234567.',
            {
                'https://www.example.com/': 'Example',
            },
        );

        expect(tokens).toEqual([
            { type: 'text', text: 'See ', marks: [] },
            {
                type: 'link',
                linkType: 'url',
                text: 'Example',
                raw: 'www.example.com',
                value: 'https://www.example.com/',
                href: 'https://www.example.com/',
                marks: [],
                target: '_blank',
                rel: 'noopener noreferrer',
            },
            { type: 'break' },
            { type: 'text', text: 'mail ', marks: [] },
            {
                type: 'link',
                linkType: 'email',
                text: 'user@example.com',
                raw: 'user@example.com',
                value: 'user@example.com',
                href: 'mailto:user@example.com',
                marks: [],
            },
            { type: 'text', text: ' and ', marks: [] },
            {
                type: 'link',
                linkType: 'personalNumber',
                text: 'S1234567',
                raw: 's1234567',
                value: 'S1234567',
                href: 'mailto:S1234567@army.idf.il',
                marks: [],
            },
            { type: 'text', text: '.', marks: [] },
        ]);
    });

    it('auto-links every detected link inside rich text tokens', () => {
        const tokens = tokenizeSmartText('Visit https://example.com or call 050-123-4567.');
        const links = tokens.filter((token) => token.type === 'link');
        expect(links).toHaveLength(2);
        expect(links[0]).toMatchObject({ linkType: 'url' });
        expect(links[1]).toMatchObject({ linkType: 'phone' });
    });

    it('normalizes manual links from bare domains', () => {
        expect(normalizeSmartLinkInput('example.com/path')).toMatchObject({
            linkType: SMART_LINK_TYPES.url,
            href: 'https://example.com/path',
            target: '_blank',
            rel: 'noopener noreferrer',
        });
    });

    it('creates and inserts a manual link at the selected text range', () => {
        const tokens = tokenizeSmartText('נא למלא טופס עד מחר');
        const linkToken = createSmartTextLinkToken({
            text: 'טופס הרשמה',
            href: 'www.example.com/register',
        });
        const start = 'נא למלא '.length;
        const end = start + 'טופס'.length;

        expect(insertSmartTextLinkToken(tokens, { start, end }, linkToken)).toEqual([
            { type: 'text', text: 'נא למלא ', marks: [] },
            {
                type: 'link',
                linkType: 'url',
                text: 'טופס הרשמה',
                raw: 'www.example.com/register',
                value: 'https://www.example.com/register',
                href: 'https://www.example.com/register',
                marks: [],
                target: '_blank',
                rel: 'noopener noreferrer',
            },
            { type: 'text', text: ' עד מחר', marks: [] },
        ]);
    });
});
