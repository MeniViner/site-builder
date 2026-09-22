import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackup, listSharePointBackupFiles, listSharePointBackups } from './sharepointUtils';

function createBackupIo({ sourceFiles, failWriteStatus = 0, failManifestStatus = 0 }) {
    const stored = new Map();
    const manifestStatuses = [];
    const writeOrder = [];
    return {
        stored,
        manifestStatuses,
        writeOrder,
        io: {
            createOperationId: () => 'backup-operation-unique',
            ensureFolder: vi.fn().mockResolvedValue(undefined),
            readSource: vi.fn(async (path) => sourceFiles.get(path)),
            writeText: vi.fn(async (path, text) => {
                writeOrder.push(path.endsWith('backup-manifest.txt') ? `manifest:${JSON.parse(text).status}` : `file:${path.split('/').pop()}`);
                if (path.endsWith('backup-manifest.txt') && failManifestStatus) {
                    const error = new Error(`SharePoint save failed (${failManifestStatus}): collision`);
                    error.status = failManifestStatus;
                    throw error;
                }
                if (!path.endsWith('backup-manifest.txt') && failWriteStatus) {
                    const error = new Error(`SharePoint save failed (${failWriteStatus}): collision`);
                    error.status = failWriteStatus;
                    throw error;
                }
                if (path.endsWith('backup-manifest.txt')) {
                    manifestStatuses.push(JSON.parse(text).status);
                }
                stored.set(path, text);
            }),
            listFiles: vi.fn(async (folder) => [...stored.keys()]
                .filter((path) => path.startsWith(`${folder}/`) && !path.endsWith('backup-manifest.txt'))
                .map((serverRelativeUrl) => ({
                    name: serverRelativeUrl.split('/').pop(),
                    serverRelativeUrl,
                }))),
            readText: vi.fn(async (path) => stored.get(path)),
        },
    };
}

describe('createBackup TXT persistence', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('captures one source snapshot and completes only after manifest read-back verification', async () => {
        const sourceFiles = new Map([
            ['/sites/alpha/siteAssets/master.txt', '{"revision":1}'],
            ['/sites/alpha/siteAssets/events.txt', '{"events":[{"id":"one"}]}'],
        ]);
        const fixture = createBackupIo({ sourceFiles });

        const result = await createBackup({
            filesToBackup: [...sourceFiles.keys()],
            trigger: 'test',
            backupIo: fixture.io,
        });

        expect(result).toMatchObject({
            success: true,
            status: 'complete',
            copiedFiles: 2,
            verifiedFiles: 2,
            backupFolderName: 'backup-operation-unique',
        });
        expect(fixture.manifestStatuses).toEqual(['pending', 'complete']);
        expect(fixture.writeOrder).toEqual([
            'manifest:pending',
            'file:master.txt',
            'file:events.txt',
            'manifest:complete',
        ]);
        expect(fixture.io.readSource).toHaveBeenCalledTimes(2);
        expect(fixture.io.readText).toHaveBeenCalled();
    });

    it('classifies a confirmed backup PUT 409 as a collision and leaves a partial manifest', async () => {
        const sourceFiles = new Map([
            ['/sites/alpha/siteAssets/master.txt', '{"revision":1}'],
        ]);
        const fixture = createBackupIo({ sourceFiles, failWriteStatus: 409 });

        const result = await createBackup({
            filesToBackup: [...sourceFiles.keys()],
            trigger: 'test',
            backupIo: fixture.io,
        });

        expect(result).toMatchObject({
            success: false,
            status: 'partial',
            copiedFiles: 0,
            failedFiles: 1,
            errorCode: 'backup_path_conflict',
            errorCategory: 'collision',
        });
        expect(fixture.manifestStatuses).toEqual(['pending', 'partial']);
    });

    it('keeps missing source files as skipped but never completes when every source is missing', async () => {
        const onePresent = createBackupIo({
            sourceFiles: new Map([
                ['/sites/alpha/siteAssets/master.txt', '{"revision":1}'],
            ]),
        });
        await expect(createBackup({
            filesToBackup: [
                '/sites/alpha/siteAssets/master.txt',
                '/sites/alpha/siteAssets/missing.txt',
            ],
            backupIo: onePresent.io,
        })).resolves.toMatchObject({
            success: true,
            status: 'complete',
            copiedFiles: 1,
            skippedFiles: 1,
            verifiedFiles: 1,
        });

        const nonePresent = createBackupIo({ sourceFiles: new Map() });
        await expect(createBackup({
            filesToBackup: ['/sites/alpha/siteAssets/missing.txt'],
            backupIo: nonePresent.io,
        })).resolves.toMatchObject({
            success: false,
            status: 'failed',
            copiedFiles: 0,
        });
    });

    it('classifies a manifest PUT 409 before any data file is written', async () => {
        const fixture = createBackupIo({
            sourceFiles: new Map([
                ['/sites/alpha/siteAssets/master.txt', '{"revision":1}'],
            ]),
            failManifestStatus: 409,
        });

        const result = await createBackup({
            filesToBackup: ['/sites/alpha/siteAssets/master.txt'],
            backupIo: fixture.io,
        });

        expect(result).toMatchObject({
            success: false,
            status: 'failed',
            copiedFiles: 0,
            errorCode: 'backup_path_conflict',
            errorCategory: 'collision',
        });
        expect(fixture.writeOrder).toEqual(['manifest:pending']);
    });

    it('hydrates manifest status while keeping legacy backups readable and hiding manifest files', async () => {
        const base = '/sites/test-site/siteDB/siteAssets/Backups';
        const completeFolder = `${base}/backup-complete`;
        const legacyFolder = `${base}/backup-legacy`;
        const manifest = {
            kind: 'bihs-txt-backup-manifest',
            version: 1,
            operationId: 'backup-complete',
            status: 'complete',
            requiredFileCount: 1,
            verifiedFileCount: 1,
            files: [{ name: 'master.txt', required: true, verified: true }],
        };
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            const value = decodeURIComponent(String(url));
            if (value.includes('/Folders?')) {
                return new Response(JSON.stringify({
                    d: {
                        results: [
                            { Name: 'backup-complete', ServerRelativeUrl: completeFolder, ItemCount: 2 },
                            { Name: 'backup-legacy', ServerRelativeUrl: legacyFolder, ItemCount: 1 },
                        ],
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (value.includes("backup-complete')/Files")) {
                return new Response(JSON.stringify({
                    d: {
                        results: [
                            { Name: 'master.txt', ServerRelativeUrl: `${completeFolder}/master.txt`, Length: 20 },
                            { Name: 'backup-manifest.txt', ServerRelativeUrl: `${completeFolder}/backup-manifest.txt`, Length: 200 },
                        ],
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (value.includes("backup-legacy')/Files")) {
                return new Response(JSON.stringify({
                    d: {
                        results: [
                            { Name: 'master.txt', ServerRelativeUrl: `${legacyFolder}/master.txt`, Length: 20 },
                        ],
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (value.startsWith(`${completeFolder}/backup-manifest.txt?sitebuilder_backup_verify=`)) {
                return new Response(JSON.stringify(manifest), { status: 200 });
            }
            throw new Error(`Unexpected URL: ${value}`);
        }));

        const result = await listSharePointBackups();

        expect(result.backups).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'backup-complete',
                status: 'complete',
                fileCount: 1,
                files: [expect.objectContaining({ name: 'master.txt' })],
                manifest: expect.objectContaining({ operationId: 'backup-complete' }),
            }),
            expect.objectContaining({
                name: 'backup-legacy',
                status: 'legacy',
                fileCount: 1,
            }),
        ]));
    });

    it('hides the manifest from the default backup-file listing', async () => {
        const folder = '/sites/test-site/siteDB/siteAssets/Backups/backup-complete';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            d: {
                results: [
                    { Name: 'master.txt', ServerRelativeUrl: `${folder}/master.txt`, Length: 20 },
                    { Name: 'backup-manifest.txt', ServerRelativeUrl: `${folder}/backup-manifest.txt`, Length: 200 },
                ],
            },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

        await expect(listSharePointBackupFiles(folder)).resolves.toEqual([
            expect.objectContaining({ name: 'master.txt' }),
        ]);
    });
});
