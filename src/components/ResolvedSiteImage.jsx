/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from 'react';
import { isKasharDemoProfile } from '../demo-data/demoProfile';
import { resolveSiteImageUrl } from '../utils/assetUrl';

const KASHAR_REFERENCE_PREFIX = 'kashar-asset:';

function isResolvableKasharReference(value) {
    return isKasharDemoProfile()
        && typeof value === 'string'
        && value.startsWith(KASHAR_REFERENCE_PREFIX);
}

export function useResolvedSiteImageUrl(value) {
    const reference = String(value || '').trim();
    const normalSource = resolveSiteImageUrl(reference);
    const [local, setLocal] = useState({ reference: '', source: '', missing: false });

    useEffect(() => {
        if (!isResolvableKasharReference(reference)) return undefined;
        let cancelled = false;
        let release = null;
        import('../services/KasharAssetStore')
            .then(({ kasharAssetStore }) => kasharAssetStore.acquireObjectUrl(reference))
            .then((resolved) => {
                if (cancelled) {
                    resolved?.release?.();
                    return;
                }
                release = resolved?.release || null;
                setLocal({ reference, source: resolved?.source || '', missing: !resolved?.source });
            })
            .catch(() => {
                if (!cancelled) setLocal({ reference, source: '', missing: true });
            });
        return () => {
            cancelled = true;
            release?.();
        };
    }, [reference]);

    if (!isResolvableKasharReference(reference)) {
        return { source: normalSource, missing: false, loading: false };
    }
    const matches = local.reference === reference;
    return {
        source: matches ? local.source : '',
        missing: matches && local.missing,
        loading: !matches,
    };
}

export function useResolvedSiteImageUrls(values) {
    const references = useMemo(() => (Array.isArray(values) ? values.map((value) => String(value || '').trim()) : []), [values]);
    const signature = JSON.stringify(references);
    const normalSources = references.map((reference) => resolveSiteImageUrl(reference));
    const [sources, setSources] = useState(() => normalSources);

    useEffect(() => {
        const requested = JSON.parse(signature);
        const localIndexes = requested
            .map((reference, index) => (isResolvableKasharReference(reference) ? index : -1))
            .filter((index) => index >= 0);
        if (localIndexes.length === 0) {
            setSources(requested.map((reference) => resolveSiteImageUrl(reference)));
            return undefined;
        }

        let cancelled = false;
        let releases = [];
        Promise.all(requested.map(async (reference) => {
            if (!isResolvableKasharReference(reference)) return resolveSiteImageUrl(reference);
            const { kasharAssetStore } = await import('../services/KasharAssetStore');
            const resolved = await kasharAssetStore.acquireObjectUrl(reference);
            if (resolved?.release) releases.push(resolved.release);
            return resolved?.source || '';
        })).then((resolved) => {
            if (!cancelled) setSources(resolved);
        }).catch(() => {
            if (!cancelled) setSources(requested.map((reference) => resolveSiteImageUrl(reference)));
        });
        return () => {
            cancelled = true;
            releases.forEach((release) => release());
            releases = [];
        };
    }, [signature]);

    return sources;
}

/** Generic image renderer which resolves normal and Kashar-local references. */
export function ResolvedSiteImage({ source, src, ...props }) {
    const { source: resolvedSource } = useResolvedSiteImageUrl(source ?? src ?? '');
    return <img {...props} src={resolvedSource} />;
}

export default ResolvedSiteImage;
