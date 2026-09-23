import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    ensureUserByIdentity: vi.fn(),
    searchSharePointUsers: vi.fn(),
}));

vi.mock('./sharePointSiteCollectionAdminsService', async () => {
    const actual = await vi.importActual<typeof import('./sharePointSiteCollectionAdminsService')>(
        './sharePointSiteCollectionAdminsService'
    );
    return {
        ...actual,
        ensureUserByIdentity: mocks.ensureUserByIdentity,
        searchSharePointUsers: mocks.searchSharePointUsers,
    };
});

import {
    ensureSingleConfirmedCandidate,
    isExactSharePointIdentityInput,
    resolveConfirmedSinglePrincipalFromCandidate,
    resolveExactSharePointIdentity,
    searchSharePointIdentityCandidates,
} from './sharePointIdentityResolver';

describe('sharePointIdentityResolver', () => {
    beforeEach(() => {
        mocks.ensureUserByIdentity.mockReset();
        mocks.searchSharePointUsers.mockReset();
    });

    describe('isExactSharePointIdentityInput', () => {
        it.each(['1234567', 's1234567', 'user@army.idf.il', 'domain\\user', 'i:0#.f|membership|user@army.idf.il'])(
            'classifies %s as an exact identity',
            (value) => expect(isExactSharePointIdentityInput(value)).toBe(true),
        );

        it.each(['נועה', 'צוות מבצעים', 'noa cohen'])(
            'keeps %s in candidate-search mode',
            (value) => expect(isExactSharePointIdentityInput(value)).toBe(false),
        );
    });

    describe('resolveExactSharePointIdentity', () => {
        it('rejects invalid identity input with a safe Hebrew message before calling SharePoint', async () => {
            const result = await resolveExactSharePointIdentity('   ');
            expect(result.ok).toBe(false);
            expect(result.error).toBe('יש להזין מספר אישי, מייל צבאי או LoginName.');
            expect(mocks.ensureUserByIdentity).not.toHaveBeenCalled();
        });

        it('resolves exactly one confirmed user principal for a personal number', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({
                Id: 17,
                Title: 'נועה כהן',
                Email: 's1234567@army.idf.il',
                LoginName: 'i:0#.f|membership|s1234567@army.idf.il',
                PrincipalType: 1,
            });

            const result = await resolveExactSharePointIdentity('s1234567');
            expect(result.ok).toBe(true);
            expect(result.principal).toMatchObject({
                displayName: 'נועה כהן',
                sharePointUserId: 17,
                email: 's1234567@army.idf.il',
            });
        });

        it('parses a classic SharePoint response envelope before confirming the user', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({
                d: {
                    Id: 17,
                    Title: 'נועה כהן',
                    Email: 's1234567@army.idf.il',
                    LoginName: 'i:0#.f|membership|s1234567@army.idf.il',
                    PrincipalType: 1,
                },
            });

            const result = await resolveExactSharePointIdentity('s1234567');

            expect(result.ok).toBe(true);
            expect(result.principal).toMatchObject({
                sharePointUserId: 17,
                loginName: 'i:0#.f|membership|s1234567@army.idf.il',
            });
        });

        it('rejects an ambiguous exact-response envelope', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({
                value: [
                    { Id: 17, PrincipalType: 1, LoginName: 'i:0#.f|membership|one@army.idf.il' },
                    { Id: 18, PrincipalType: 1, LoginName: 'i:0#.f|membership|two@army.idf.il' },
                ],
            });

            const result = await resolveExactSharePointIdentity('s1234567');

            expect(result.ok).toBe(false);
            expect(result.error).toBe('נמצאו מספר משתמשים תואמים. יש לצמצם את החיפוש ולבחור אדם אחד בלבד.');
        });

        it('rejects a SharePoint group returned instead of a single confirmed user', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({
                Id: 9,
                Title: 'קבוצת מבצעים',
                LoginName: 'ops-group',
                PrincipalType: 8,
            });

            const result = await resolveExactSharePointIdentity('ops-group');
            expect(result.ok).toBe(false);
            expect(result.error).toBe('ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.');
        });

        it('rejects an incomplete/unresolved SharePoint response without leaking raw payload', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({ Id: 0, PrincipalType: 1 });

            const result = await resolveExactSharePointIdentity('s1234567');
            expect(result.ok).toBe(false);
            expect(result.error).toBe('לא ניתן לזהות משתמש מאומת יחיד עבור הערך שהוזן.');
        });

        it('maps a failed/stale SharePoint lookup to a safe actionable Hebrew message', async () => {
            const rawServerError = Object.assign(new Error('boom'), {
                status: 500,
                responseBody: { 'odata.error': { message: { value: 'Internal secret trace 0x99AF' } } },
            });
            mocks.ensureUserByIdentity.mockRejectedValue(rawServerError);

            const result = await resolveExactSharePointIdentity('s1234567');
            expect(result.ok).toBe(false);
            expect(result.error).not.toMatch(/0x99AF/);
            expect(result.error).toBe(
                'SharePoint לא הצליח לזהות את המשתמש לפי הערך שהוזן. נסה מספר אישי, מייל צבאי מלא או LoginName כפי שהוא מופיע ב-SharePoint.'
            );
        });
    });

    describe('ensureSingleConfirmedCandidate', () => {
        it('rejects zero results', () => {
            const result = ensureSingleConfirmedCandidate([]);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('לא נמצא משתמש מתאים. נסו לחדד את החיפוש.');
        });

        it('rejects an ambiguous result set with more than one confirmed user', () => {
            const result = ensureSingleConfirmedCandidate([
                { Id: 1, PrincipalType: 1, Title: 'א' },
                { Id: 2, PrincipalType: 1, Title: 'ב' },
            ]);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('נמצאו מספר משתמשים תואמים. יש לצמצם את החיפוש ולבחור אדם אחד בלבד.');
        });

        it('filters out group principals and keeps a single confirmed user candidate', () => {
            const result = ensureSingleConfirmedCandidate([
                { Id: 9, PrincipalType: 8, Title: 'קבוצה' },
                { Id: 1, PrincipalType: 1, Title: 'משתמש יחיד' },
            ]);
            expect(result.ok).toBe(true);
            expect(result.candidate.Title).toBe('משתמש יחיד');
        });

        it('parses claims-picker envelopes into one confirmed user candidate', () => {
            const result = ensureSingleConfirmedCandidate({
                d: {
                    results: [{
                        Key: 'i:0#.f|membership|noa@army.idf.il',
                        DisplayText: 'נועה כהן',
                        EntityType: 'User',
                        EntityData: {
                            SPUserID: '17',
                            Email: 'noa@army.idf.il',
                            PrincipalType: 'User',
                        },
                    }],
                },
            });

            expect(result.ok).toBe(true);
            expect(result.candidate).toMatchObject({
                Id: 17,
                Title: 'נועה כהן',
                Email: 'noa@army.idf.il',
                LoginName: 'i:0#.f|membership|noa@army.idf.il',
                PrincipalType: 1,
            });
        });
    });

    describe('searchSharePointIdentityCandidates', () => {
        it('uses the supported SharePoint search and parses modern response envelopes', async () => {
            mocks.searchSharePointUsers.mockResolvedValue({
                value: [{
                    Id: 17,
                    Title: 'נועה כהן',
                    Email: 'noa@army.idf.il',
                    LoginName: 'i:0#.f|membership|noa@army.idf.il',
                    PrincipalType: 1,
                }],
            });

            const result = await searchSharePointIdentityCandidates('נועה');

            expect(mocks.searchSharePointUsers).toHaveBeenCalledWith('נועה', expect.any(Array));
            expect(result).toEqual({
                ok: true,
                candidates: [expect.objectContaining({ Id: 17, Title: 'נועה כהן' })],
            });
        });
    });

    describe('resolveConfirmedSinglePrincipalFromCandidate', () => {
        it('rejects a candidate that is a group before attempting the final resolve', async () => {
            const result = await resolveConfirmedSinglePrincipalFromCandidate({
                Id: 9,
                PrincipalType: 8,
                Title: 'קבוצה',
                LoginName: 'ops-group',
            });
            expect(result.ok).toBe(false);
            expect(result.error).toBe('ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.');
            expect(mocks.ensureUserByIdentity).not.toHaveBeenCalled();
        });

        it('performs an explicit final resolve for a user candidate picked from search results', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({
                Id: 17,
                Title: 'נועה כהן',
                Email: 's1234567@army.idf.il',
                LoginName: 'i:0#.f|membership|s1234567@army.idf.il',
                PrincipalType: 1,
            });

            const result = await resolveConfirmedSinglePrincipalFromCandidate({
                Id: 17,
                PrincipalType: 1,
                Title: 'נועה כהן',
                LoginName: 'i:0#.f|membership|s1234567@army.idf.il',
                Email: 's1234567@army.idf.il',
            });

            expect(mocks.ensureUserByIdentity).toHaveBeenCalledWith(
                'i:0#.f|membership|s1234567@army.idf.il',
                expect.any(Array)
            );
            expect(result.ok).toBe(true);
            expect(result.principal.sharePointUserId).toBe(17);
        });

        it('surfaces a safe stale-result error when the candidate no longer resolves on final confirm', async () => {
            mocks.ensureUserByIdentity.mockRejectedValue(Object.assign(new Error('not found'), { status: 400 }));

            const result = await resolveConfirmedSinglePrincipalFromCandidate({
                Id: 17,
                PrincipalType: 1,
                Title: 'נועה כהן',
                LoginName: 'i:0#.f|membership|s1234567@army.idf.il',
            });

            expect(result.ok).toBe(false);
            expect(result.error).toBe(
                'SharePoint לא הצליח לזהות את המשתמש לפי הערך שהוזן. נסה מספר אישי, מייל צבאי מלא או LoginName כפי שהוא מופיע ב-SharePoint.'
            );
        });

        it('rejects a stale picker result when final resolution returns a different SharePoint user', async () => {
            mocks.ensureUserByIdentity.mockResolvedValue({
                Id: 18,
                Title: 'משתמש אחר',
                Email: 'other@army.idf.il',
                LoginName: 'i:0#.f|membership|other@army.idf.il',
                PrincipalType: 1,
            });

            const result = await resolveConfirmedSinglePrincipalFromCandidate({
                Id: 17,
                PrincipalType: 1,
                Title: 'נועה כהן',
                LoginName: 'i:0#.f|membership|noa@army.idf.il',
            });

            expect(result.ok).toBe(false);
            expect(result.error).toBe('תוצאת החיפוש אינה עדכנית. חפשו את המשתמש מחדש ובחרו שוב.');
        });

        it('rejects a candidate missing SharePoint identity details without calling ensureUserByIdentity', async () => {
            const result = await resolveConfirmedSinglePrincipalFromCandidate({ Id: 17, PrincipalType: 1, Title: 'ללא זיהוי' });
            expect(result.ok).toBe(false);
            expect(result.error).toBe('למשתמש שנבחר חסרים פרטי זיהוי של SharePoint.');
            expect(mocks.ensureUserByIdentity).not.toHaveBeenCalled();
        });
    });
});
