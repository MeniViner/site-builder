import { describe, expect, it } from 'vitest';
import {
  extractAdminAiCandidates,
  normalizeAdminAiCandidate,
  sanitizeAdminAiSnapshot,
} from './adminAiCapabilities';

describe('adminAiCapabilities', () => {
  it('extracts multiple alternatives for version browsing', () => {
    expect(extractAdminAiCandidates({ alternatives: [{ a: 1 }, { a: 2 }, { a: 3 }] })).toHaveLength(3);
  });

  it('never sends poll voter identities to the model', () => {
    const safe = sanitizeAdminAiSnapshot('polls', [{
      id: 'p1',
      question: 'Q',
      active: true,
      options: [{ id: 'o1', text: 'A', votes: 2, voters: [{ name: 'Secret User', email: 'x@y.z' }] }],
    }]);
    expect(safe[0].options[0].votes).toBe(2);
    expect(safe[0].options[0].voters).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain('Secret User');
  });

  it('preserves external URLs unless a new URL was explicitly provided', () => {
    const current = [{ id: 'x', title: 'מערכת', url: 'https://existing.example', icon: 'Link' }];
    const next = normalizeAdminAiCandidate(
      'external-links',
      { items: [{ id: 'x', title: 'שם משופר', url: 'https://invented.example' }] },
      current,
      { instruction: 'שפר את השם בלבד' },
    );
    expect(next[0].url).toBe('https://existing.example');
    expect(next[0].title).toBe('שם משופר');
  });

  it('preserves gallery media references while allowing metadata improvements', () => {
    const current = [{
      id: 'g1', title: 'ישן', description: '', active: true, style: 'classic-carousel', order: 0,
      images: [{ id: 'i1', mediaRef: '/images/a.jpg', alt: '', caption: '', width: 10, height: 10, media: { fileName: 'a.jpg' } }],
    }];
    const next = normalizeAdminAiCandidate('galleries', {
      items: [{ id: 'g1', title: 'חדש', images: [{ id: 'i1', mediaRef: 'https://bad.example', alt: 'תיאור' }] }],
    }, current);
    expect(next[0].images[0].mediaRef).toBe('/images/a.jpg');
    expect(next[0].images[0].alt).toBe('תיאור');
  });

  it('does not invent phone numbers', () => {
    const next = normalizeAdminAiCandidate(
      'phonebook',
      { items: [{ name: 'ישראל ישראלי', number: '050-1111111', department: 'מטה' }] },
      [],
      { instruction: 'הוסף ישראל ישראלי למחלקת מטה' },
    );
    expect(next).toEqual([]);
  });

  it('preserves poll votes and voter data when AI edits wording', () => {
    const current = [{
      id: 'p1', question: 'ישן', active: true,
      options: [{ id: 'o1', text: 'כן', votes: 4, voters: [{ id: 'u1', name: 'א' }] }],
    }];
    const next = normalizeAdminAiCandidate('polls', {
      items: [{ id: 'p1', question: 'ניסוח ניטרלי', active: true, options: [{ id: 'o1', text: 'כן', votes: 999 }] }],
    }, current);
    expect(next[0].question).toBe('ניסוח ניטרלי');
    expect(next[0].options[0].votes).toBe(4);
    expect(next[0].options[0].voters).toEqual([{ id: 'u1', name: 'א' }]);
  });

  it('normalizes BOOM task and dashboard updates through the BOOM contract', () => {
    const current = {
      enabled: true,
      pageTitle: 'BOOM',
      design: { preset: 'operational', showDashboard: true },
      categories: [{ id: 'general', name: 'כללי', color: '#2563eb', order: 1 }],
      items: [],
    };
    const next = normalizeAdminAiCandidate('boom', {
      boom: {
        design: {
          preset: 'command-center',
          showDashboard: false,
          dashboardWidgets: ['overview', 'categories', 'invalid'],
          tableDensity: 'compact',
        },
        categories: [{ id: 'ops', name: 'מבצעים', color: '#0f766e' }],
        items: [{
          id: 'task-1',
          title: 'עדכון מצב',
          owner: 'חדר מבצעים',
          category: 'מבצעים',
          status: 'active',
          startDate: '2026-06-20',
          endDate: '2026-06-10',
          progress: 77,
        }],
      },
    }, current);

    expect(next.design).toMatchObject({
      preset: 'command-center',
      showDashboard: false,
      dashboardWidgets: ['overview', 'categories'],
      tableDensity: 'compact',
    });
    expect(next.items[0]).toMatchObject({
      title: 'עדכון מצב',
      owner: 'חדר מבצעים',
      category: 'מבצעים',
      color: '#0f766e',
      endDate: '2026-06-20',
    });
    expect(next.items[0]).not.toHaveProperty('progress');
  });
});
