import { describe, expect, it } from 'vitest';
import {
    buildEventsAiPromptText,
    normalizeAiEventsPayload,
    resolveRequestedAiEventCount,
} from './eventsAi';

function eventItem(id, overrides = {}) {
    return {
        id,
        date: `2026-06-${String(id).padStart(2, '0')}`,
        title: `אירוע ${id}`,
        subtitle: 'פרטים נוספים',
        color: 'gray',
        ...overrides,
    };
}

describe('eventsAi', () => {
    it('resolves requested event count with default and max', () => {
        expect(resolveRequestedAiEventCount('צור סדרת אירועים לחודש הבא')).toBe(3);
        expect(resolveRequestedAiEventCount('צור 5 אירועים לחודש הבא')).toBe(5);
        expect(resolveRequestedAiEventCount('צור 12 אירועים לחודש הבא')).toBe(6);
        expect(resolveRequestedAiEventCount('create two events for onboarding')).toBe(2);
        expect(resolveRequestedAiEventCount('צור אירועים לשנת 2026')).toBe(3);
    });

    it('normalizes rich text from AI events and caps to the requested count', () => {
        const normalized = normalizeAiEventsPayload({
            eventCount: 2,
            events: [
                eventItem(1, {
                    subtitle: 'נא להגיע עם S12345678',
                    subtitleRichText: [
                        { type: 'text', text: 'נא להגיע עם ', marks: ['bold'] },
                        {
                            type: 'link',
                            linkType: 'personalNumber',
                            text: 'S12345678',
                            raw: 'S12345678',
                            value: 'S12345678',
                            href: 'mailto:S12345678@army.idf.il',
                            marks: [],
                        },
                    ],
                }),
                eventItem(2),
                eventItem(3),
            ],
            displayCount: 5,
            displayMode: 'monthly',
            intervalSeconds: 8,
        });

        expect(normalized.events).toHaveLength(2);
        expect(normalized.displayCount).toBe(2);
        expect(normalized.displayMode).toBe('monthly');
        expect(normalized.intervalMs).toBe(8000);
        expect(normalized.events[0]).toMatchObject({
            subtitle: 'נא להגיע עם S12345678',
            subtitleRichText: [
                { type: 'text', text: 'נא להגיע עם ', marks: ['bold'] },
                {
                    type: 'link',
                    linkType: 'personalNumber',
                    text: 'S12345678',
                    href: 'mailto:S12345678@army.idf.il',
                },
            ],
        });
    });

    it('rejects AI payloads with fewer valid events than requested', () => {
        expect(() => normalizeAiEventsPayload({
            eventCount: 3,
            events: [eventItem(1), eventItem(2, { date: 'not-a-date' })],
        })).toThrow('מתוך 3');
    });

    it('documents rich text and exact event count in the prompt', () => {
        const prompt = buildEventsAiPromptText({
            instruction: 'צור 4 אירועים',
            today: '2026-05-27',
            requestedEventCount: 4,
            currentSnapshot: { events: [] },
        });

        expect(prompt).toContain('"eventCount": 4');
        expect(prompt).toContain('"subtitleRichText"');
        expect(prompt).toContain('צור בדיוק 4 אירועים');
        expect(prompt).toContain('7 או 8 ספרות');
    });
});
