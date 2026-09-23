import { afterEach, describe, expect, it, vi } from 'vitest';
import { upsertSharePointTextFile } from './sharepointUtils';

const response = (status, body = '') => new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
});

describe('upsertSharePointTextFile 409 recovery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('repairs and retries a 409 only when an exact parent probe confirms it is missing', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(409, '{"error":{"code":"parent-missing"}}'))
            .mockResolvedValueOnce(response(200));
        vi.stubGlobal('fetch', fetchMock);
        const ensureParent = vi.fn().mockResolvedValue(undefined);

        await expect(upsertSharePointTextFile({
            serverRelativeUrl: '/sites/alpha/backups/op-1/master.txt',
            text: '{"ok":true}',
            digest: 'digest',
            recoveryIo: {
                probeParent: vi.fn().mockResolvedValue({ exists: false, status: 404 }),
                ensureParent,
            },
        })).resolves.toMatchObject({ created: true });

        expect(ensureParent).toHaveBeenCalledWith('/sites/alpha/backups/op-1', 'digest');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('preserves an existing target on a genuine 409 collision or lock', async () => {
        const fetchMock = vi.fn().mockResolvedValue(response(409, '{"error":{"code":"locked"}}'));
        vi.stubGlobal('fetch', fetchMock);
        const ensureParent = vi.fn();

        await expect(upsertSharePointTextFile({
            serverRelativeUrl: '/sites/alpha/backups/op-1/master.txt',
            text: 'new bytes',
            digest: 'digest',
            recoveryIo: {
                probeParent: vi.fn().mockResolvedValue({ exists: true, status: 200 }),
                ensureParent,
            },
        })).rejects.toMatchObject({
            status: 409,
            code: 'sharepoint_file_collision',
            category: 'collision',
        });

        expect(ensureParent).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('keeps authorization failures separate from missing-parent recovery', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(409)));

        await expect(upsertSharePointTextFile({
            serverRelativeUrl: '/sites/alpha/backups/op-1/master.txt',
            text: 'new bytes',
            digest: 'digest',
            recoveryIo: {
                probeParent: vi.fn().mockResolvedValue({ exists: null, status: 403 }),
                ensureParent: vi.fn(),
            },
        })).rejects.toMatchObject({
            status: 403,
            code: 'sharepoint_parent_probe_forbidden',
            category: 'authorization',
        });
    });
});
