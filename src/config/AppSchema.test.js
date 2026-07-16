import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_V1, migrateLegacyToV1, validateAndNormalize } from './AppSchema';

describe('migrateLegacyToV1', () => {
    it('preserves default branches when partial legacy data omits them', () => {
        const defaults = validateAndNormalize(DEFAULT_CONFIG_V1);
        const migrated = migrateLegacyToV1({
            theme: {
                primaryColor: '#123456',
            },
        });

        expect(migrated.theme.primaryColor).toBe('#123456');
        expect(migrated.navigation.items).toEqual(defaults.navigation.items);
        expect(migrated.externalLinks.items).toEqual(defaults.externalLinks.items);
        expect(migrated.access.adminUsers).toEqual(defaults.access.adminUsers);
    });

    it('keeps explicit empty legacy branches empty', () => {
        const migrated = migrateLegacyToV1({
            nav: [],
            externalLinks: [],
            users: [],
        });

        expect(migrated.navigation.items).toEqual([]);
        expect(migrated.externalLinks.items).toEqual([]);
        expect(migrated.access.adminUsers).toEqual([]);
    });

    it('preserves legacy navigation target aliases and folder/link intent', () => {
        const migrated = migrateLegacyToV1({
            nav: [
                {
                    id: 'network-root',
                    title: 'Network root',
                    type: 'directory',
                    folderPath: '\\\\fileserver\\public',
                    children: [
                        { id: 'handbook', label: 'Handbook', href: 'smb://fileserver/public/handbook' },
                    ],
                },
            ],
        });

        expect(migrated.navigation.items[0]).toMatchObject({
            id: 'network-root',
            label: 'Network root',
            kind: 'folder',
            url: '\\\\fileserver\\public',
        });
        expect(migrated.navigation.items[0].children[0]).toMatchObject({
            id: 'handbook',
            kind: 'link',
            url: 'smb://fileserver/public/handbook',
        });
    });
});
