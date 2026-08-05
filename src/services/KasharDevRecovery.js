import { isKasharDemoProfile } from '../demo-data/demoProfile';
import kasharDraftStore from './KasharDraftStore';

/**
 * A deliberately narrow development escape hatch for recovering a draft when
 * the normal application has not loaded. The startup UI is the primary path;
 * this remains useful when a valid active draft coexists with an old invalid
 * forensic backup that must be downloaded.
 */
export function installKasharDevRecovery({
    isDevelopment = import.meta.env.DEV,
    isKashar = isKasharDemoProfile,
    store = kasharDraftStore,
    target = typeof window === 'undefined' ? null : window,
} = {}) {
    if (!isDevelopment || !target || !isKashar()) return false;

    const confirmAndRun = async (message, operation) => {
        if (!target.confirm(message)) return false;
        return operation();
    };
    const recovery = Object.freeze({
        inspect: () => store.inspect(),
        getRaw: (key) => store.getRawForRecovery(key),
        exportCurrentDraft: () => store.exportDraft(),
        reset: () => confirmAndRun(
            'Reset Kashar demo data? This replaces the active draft with the fixture after preserving readable data.',
            () => store.reset(),
        ),
        importDraft: (text) => confirmAndRun(
            'Import this Kashar draft? The current active draft will be backed up first.',
            () => store.importDraftText(text),
        ),
    });

    Object.defineProperty(target, '__KASHAR_DEMO_RECOVERY__', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: recovery,
    });
    return true;
}
