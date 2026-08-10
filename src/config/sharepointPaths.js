// src/config/sharepointPaths.js
// The proxy preserves the existing import shape while resolving every field
// from the frozen runtime descriptor created during application bootstrap.
import { getRuntimeConfig, isRuntimeConfigLoaded } from '../services/storage/runtimeConfig';
import { createSharePointRuntimeDescriptor } from './sharepointRuntimeDescriptor';

const testDescriptor = import.meta.env.MODE === 'test'
    ? createSharePointRuntimeDescriptor({ host: 'test.local', siteCode: 'test-site' })
    : null;

export function getSharePointPaths() {
    const runtimeConfig = getRuntimeConfig();
    if (runtimeConfig?.host && runtimeConfig?.siteCode) return runtimeConfig;
    if (testDescriptor) return testDescriptor;
    const state = isRuntimeConfigLoaded() ? 'does not contain SharePoint site identity' : 'has not been initialized';
    throw new Error(`SharePoint runtime configuration ${state}.`);
}

export const SHAREPOINT_PATHS = new Proxy({}, {
    get: (_target, property) => getSharePointPaths()[property],
    has: (_target, property) => property in getSharePointPaths(),
    ownKeys: () => Reflect.ownKeys(getSharePointPaths()),
    getOwnPropertyDescriptor: (_target, property) => {
        const descriptor = getSharePointPaths();
        if (!(property in descriptor)) return undefined;
        return { configurable: true, enumerable: true, value: descriptor[property] };
    },
});

export default SHAREPOINT_PATHS;
