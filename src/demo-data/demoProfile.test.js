import { describe, expect, it } from 'vitest';
import { isKasharDemoProfile, resolveDemoProfile } from './demoProfile';

describe('demo profile resolution', () => {
    it('enables the Kashar profile only for the exact Vite value', () => {
        expect(resolveDemoProfile({ VITE_DEMO_PROFILE: 'kashar' })).toBe('kashar');
        expect(isKasharDemoProfile({ VITE_DEMO_PROFILE: 'kashar' })).toBe(true);
    });

    it.each([
        undefined,
        '',
        'KASHAR',
        'kashar ',
        'another-demo',
    ])('does not activate for %j', (profile) => {
        expect(resolveDemoProfile({ VITE_DEMO_PROFILE: profile })).toBeNull();
        expect(isKasharDemoProfile({ VITE_DEMO_PROFILE: profile })).toBe(false);
    });
});
