/**
 * @typedef {'kashar' | null} DemoProfile
 */

export const KASHAR_DEMO_PROFILE = 'kashar';

// Do not pass import.meta.env wholesale: Vite serializes the entire public env
// object when it is referenced as an object, which could leak unrelated
// deployment values into an otherwise universal production bundle.
const defaultEnvironment = Object.freeze({
    VITE_DEMO_PROFILE: import.meta.env.VITE_DEMO_PROFILE,
});

/**
 * Resolves only explicitly supported demo profiles. Keeping this strict prevents
 * an accidental environment value from replacing the normal site data source.
 *
 * @param {{ VITE_DEMO_PROFILE?: unknown }} environment
 * @returns {DemoProfile}
 */
export function resolveDemoProfile(environment = defaultEnvironment) {
    return environment?.VITE_DEMO_PROFILE === KASHAR_DEMO_PROFILE
        ? KASHAR_DEMO_PROFILE
        : null;
}

/**
 * @param {{ VITE_DEMO_PROFILE?: unknown }} environment
 * @returns {boolean}
 */
export function isKasharDemoProfile(environment = defaultEnvironment) {
    return resolveDemoProfile(environment) === KASHAR_DEMO_PROFILE;
}
