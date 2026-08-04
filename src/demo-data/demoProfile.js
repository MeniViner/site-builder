/**
 * @typedef {'kashar' | null} DemoProfile
 */

export const KASHAR_DEMO_PROFILE = 'kashar';

/**
 * Resolves only explicitly supported demo profiles. Keeping this strict prevents
 * an accidental environment value from replacing the normal site data source.
 *
 * @param {{ VITE_DEMO_PROFILE?: unknown }} environment
 * @returns {DemoProfile}
 */
export function resolveDemoProfile(environment = import.meta.env) {
    return environment?.VITE_DEMO_PROFILE === KASHAR_DEMO_PROFILE
        ? KASHAR_DEMO_PROFILE
        : null;
}

/**
 * @param {{ VITE_DEMO_PROFILE?: unknown }} environment
 * @returns {boolean}
 */
export function isKasharDemoProfile(environment = import.meta.env) {
    return resolveDemoProfile(environment) === KASHAR_DEMO_PROFILE;
}
