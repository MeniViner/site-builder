import { describe, expect, it } from 'vitest';
import {
    appendNotificationOnce,
    buildBoomAssignmentNotification,
    filterNotificationsForUser,
    getNotificationDismissalStorageKey,
    normalizeNotification,
} from './notificationData';

describe('notificationData', () => {
    const user = { sharePointUserId: 17, displayName: 'נועה' };

    it('keeps legacy alerts compatible', () => {
        expect(normalizeNotification({ id: 'old', title: 'כותרת', text: 'תוכן', isUrgent: true }))
            .toMatchObject({
                id: 'old',
                text: 'תוכן',
                isUrgent: true,
                popupActive: false,
                audience: { type: 'all' },
            });
    });

    it('filters targeted notifications by stable identity', () => {
        const visible = filterNotificationsForUser([
            { id: 'all', text: 'all' },
            { id: 'mine', text: 'mine', audience: { type: 'users', identities: ['sp:17'] } },
            { id: 'other', text: 'other', audience: { type: 'users', identities: ['sp:18'] } },
        ], user);
        expect(visible.map((item) => item.id)).toEqual(['all', 'mine']);
    });

    it('matches targeted notifications for sessions that only expose login or email identity', () => {
        const notification = {
            id: 'targeted',
            text: 'mine',
            audience: {
                type: 'users',
                identities: ['sp:17', 'login:i:0#.f|membership|user@army.idf.il', 'email:user@army.idf.il'],
            },
        };
        expect(filterNotificationsForUser([notification], {
            loginName: 'i:0#.f|membership|USER@army.idf.il',
        })).toHaveLength(1);
        expect(filterNotificationsForUser([notification], {
            email: 'USER@ARMY.IDF.IL',
        })).toHaveLength(1);
    });

    it('deduplicates BOOM assignment notifications across repeated autosaves', () => {
        const task = { id: 'task-1', title: 'בדיקה', assignmentVersion: 1 };
        const assignee = { identityKey: 'sp:17' };
        const notification = buildBoomAssignmentNotification(task, assignee, new Date('2026-01-01T00:00:00Z'));
        const first = appendNotificationOnce([], notification);
        const second = appendNotificationOnce(first, notification);
        expect(second).toHaveLength(1);
        expect(second[0].eventKey).toBe('boom-assignment:task-1:sp:17:1');
    });

    it('namespaces dismissal state by site and user without using a personal number', () => {
        const first = getNotificationDismissalStorageKey('site-a', user);
        const second = getNotificationDismissalStorageKey('site-b', user);
        expect(first).not.toBe(second);
        expect(first).toContain('sp%3A17');
    });
});
