/**
 * Deterministic stubs for the SharePoint REST calls the identity resolver
 * makes. In the standalone dev boot `resolveCurrentSharePointWebUrl`
 * (src/utils/resolveCurrentSharePointWebUrl.js) falls all the way back to
 * `window.location.origin`, so every call lands on
 * http://localhost:5199/_api/... and can be routed from the test.
 */

export const ADMIN_CURRENT_USER = {
    Id: 12,
    Title: 'מנהל בדיקות',
    Email: 's8856096@army.idf.il',
    // 8856096 is the hard-coded admin bypass in src/context/AuthContext.jsx.
    LoginName: 'i:0#.f|membership|s8856096@army.idf.il',
    IsSiteAdmin: true,
};

export const RONI = {
    Id: 44,
    Title: 'רוני',
    Email: 'roni@army.idf.il',
    LoginName: 'i:0#.f|membership|roni@army.idf.il',
    PrincipalType: 1,
};

export const NOA = {
    Id: 17,
    Title: 'נועה',
    Email: 'noa@army.idf.il',
    LoginName: 'i:0#.f|membership|noa@army.idf.il',
    PrincipalType: 1,
};

const json = (body) => ({
    status: 200,
    contentType: 'application/json;odata=verbose',
    body: JSON.stringify(body),
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {{
 *   ensureUser?: () => Promise<object|null>|object|null,
 *   searchUsers?: () => Promise<object[]>|object[],
 *   onEnsureUser?: () => void,
 * }} [handlers]
 */
export async function stubSharePointIdentityApi(page, handlers = {}) {
    await page.route('**/_api/**', async (route) => {
        const url = route.request().url();

        if (url.includes('/_api/contextinfo')) {
            return route.fulfill(json({ d: { GetContextWebInformation: { FormDigestValue: 'e2e-digest' } } }));
        }
        if (url.includes('/_api/web/currentuser')) {
            return route.fulfill(json({ d: ADMIN_CURRENT_USER }));
        }
        if (url.includes('/_api/web/ensureuser')) {
            handlers.onEnsureUser?.();
            const user = handlers.ensureUser ? await handlers.ensureUser() : RONI;
            if (!user) {
                return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stubbed failure"}' });
            }
            return route.fulfill(json({ d: user }));
        }
        if (url.includes('/_api/web/siteusers')) {
            const results = handlers.searchUsers ? await handlers.searchUsers() : [];
            return route.fulfill(json({ d: { results } }));
        }
        return route.fulfill(json({}));
    });
}

/** A promise a test resolves by hand, used to hold a stubbed lookup open. */
export function gate() {
    let release = () => {};
    const promise = new Promise((resolve) => { release = resolve; });
    return { promise, release };
}
