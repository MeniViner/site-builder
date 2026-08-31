import { describe, expect, it } from 'vitest';
import {
  ADMIN_AI_CAPABILITIES,
  applyAdminAiActionSemantics,
  extractAdminAiCandidates,
  isAdminAiReadOnly,
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

  it('allows an explicitly supplied external URL replacement', () => {
    const current = [{ id: 'x', title: 'מערכת', url: 'https://existing.example', icon: 'Link' }];
    const next = normalizeAdminAiCandidate(
      'external-links',
      { items: [{ id: 'x', title: 'מערכת', url: 'https://replacement.example' }] },
      current,
      { instruction: 'החלף לכתובת https://replacement.example' },
    );
    expect(next[0].url).toBe('https://replacement.example');
  });

  it('preserves navigation URLs unless a replacement URL was supplied', () => {
    const current = [{
      id: 'cat-1',
      label: 'מערכות',
      url: 'https://existing.example',
      children: [],
    }];
    const preserved = normalizeAdminAiCandidate(
      'links',
      { navItems: [{ id: 'cat-1', label: 'מערכות חדשות', url: 'https://invented.example', children: [] }] },
      current,
      { actionId: 'rename', instruction: 'שפר את שם הקטגוריה' },
    );
    const replaced = normalizeAdminAiCandidate(
      'links',
      { navItems: [{ id: 'cat-1', label: 'מערכות', url: 'https://replacement.example', children: [] }] },
      current,
      { actionId: 'restructure', instruction: 'החלף לכתובת https://replacement.example' },
    );
    expect(preserved[0].url).toBe('https://existing.example');
    expect(replaced[0].url).toBe('https://replacement.example');
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

  it('replaces a phone number only when the replacement was supplied', () => {
    const current = [{ id: 'c1', name: 'ישראל ישראלי', number: '050-1111111', department: 'מטה' }];
    const next = normalizeAdminAiCandidate(
      'phonebook',
      { items: [{ id: 'c1', name: 'ישראל ישראלי', number: '050-2222222', department: 'מטה' }] },
      current,
      { instruction: 'עדכן את ישראל ישראלי למספר 050-2222222' },
    );
    expect(next[0].number).toBe('050-2222222');
  });

  it('preserves poll votes and voter data when AI edits wording', () => {
    const current = [{
      id: 'p1', question: 'ישן', active: true,
      options: [{ id: 'o1', text: 'כן', votes: 4, voters: [{ id: 'u1', name: 'א' }] }],
    }];
    const next = normalizeAdminAiCandidate('polls', {
      items: [{ question: 'ניסוח ניטרלי', active: true, options: [{ text: 'בהחלט', votes: 999 }] }],
    }, current, { actionId: 'rewrite-bias' });
    expect(next[0].question).toBe('ניסוח ניטרלי');
    expect(next[0].options[0].text).toBe('בהחלט');
    expect(next[0].options[0].votes).toBe(4);
    expect(next[0].options[0].voters).toEqual([{ id: 'u1', name: 'א' }]);
  });

  it('treats analysis actions as output-only', () => {
    expect(isAdminAiReadOnly('news', 'audit')).toBe(true);
    expect(isAdminAiReadOnly('polls', 'bias')).toBe(true);
    expect(isAdminAiReadOnly('gantt', 'audit')).toBe(true);
    expect(isAdminAiReadOnly('org-chart', 'audit')).toBe(true);
    expect(isAdminAiReadOnly('links', 'audit')).toBe(true);
    expect(isAdminAiReadOnly('boom', 'audit')).toBe(true);
    expect(isAdminAiReadOnly('polls', 'rewrite-bias')).toBe(false);
    expect(isAdminAiReadOnly('links', 'fix-audit')).toBe(false);
  });

  it('keeps the complete read-only action inventory explicit in capability metadata', () => {
    const actual = Object.entries(ADMIN_AI_CAPABILITIES).flatMap(([surface, capability]) => (
      capability.actions
        .filter((item) => capability.readOnly === true || item.readOnly === true)
        .map((item) => `${surface}:${item.id}`)
    ));
    expect(actual).toEqual([
      'links:audit',
      'events:audit',
      'galleries:audit',
      'gantt:audit',
      'gantt:status',
      'boom:audit',
      'org-chart:audit',
      'org-chart:layout',
      'alerts:audit',
      'news:audit',
      'phonebook:duplicates',
      'shuttles:audit',
      'polls:bias',
      'polls:options',
      'polls:results',
      'heritage:attribution',
      'tips:audit',
      'admins:explain',
      'admins:logs',
      'site-owners:explain',
      'site-owners:logs',
      'backups:explain',
      'backups:restore',
      'backups:risk',
      'ai-help:explain',
      'ai-help:what-next',
    ]);
  });

  it('preserves existing news when adding a generated flash', () => {
    const existing = [{ id: 'existing', text: 'קיים', isUrgent: false }];
    const candidate = [{ id: 'new', text: 'חדש', isUrgent: false }];
    expect(applyAdminAiActionSemantics('news', 'flash', existing, candidate)).toEqual([
      existing[0],
      candidate[0],
    ]);
  });

  it('preserves omitted navigation branches during additive paste', () => {
    const baseline = [{
      id: 'cat-1',
      label: 'מערכות',
      children: [
        { id: 'sub-1', title: 'ראשי', subLinks: [{ id: 'link-1', label: 'קיים', url: 'https://one.example' }] },
        { id: 'sub-2', title: 'נוסף', subLinks: [{ id: 'link-2', label: 'חשוב', url: 'https://two.example' }] },
      ],
    }];
    const candidate = [{
      id: 'cat-1',
      label: 'מערכות',
      children: [{
        id: 'sub-1',
        title: 'ראשי',
        subLinks: [{ id: 'link-3', label: 'חדש', url: 'https://three.example' }],
      }],
    }];
    const next = applyAdminAiActionSemantics('links', 'paste', baseline, candidate);
    expect(next[0].children).toHaveLength(2);
    expect(next[0].children[0].subLinks.map((item) => item.id)).toEqual(['link-1', 'link-3']);
    expect(next[0].children[1].subLinks[0].url).toBe('https://two.example');
  });

  it('preserves existing Gantt milestones when generating another milestone', () => {
    const baseline = {
      categories: [],
      items: [{
        id: 'task-1',
        title: 'משימה',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        milestones: [
          { id: 'm1', title: 'ראשון', date: '2026-09-05' },
          { id: 'm2', title: 'שני', date: '2026-09-10' },
        ],
      }],
    };
    const normalized = normalizeAdminAiCandidate(
      'gantt',
      {
        items: [{
          id: 'task-1',
          title: 'משימה',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          milestones: [{ title: 'חדש', date: '2026-09-20' }],
        }],
      },
      baseline,
      { actionId: 'milestones', instruction: 'הוסף אבן דרך ב-20 בספטמבר' },
    );
    const next = applyAdminAiActionSemantics('gantt', 'milestones', baseline, normalized);
    expect(next.items[0].milestones.map((item) => item.id)).toEqual(['m1', 'm2', expect.stringMatching(/^milestone-/)]);
    expect(next.items[0].milestones[2].title).toBe('חדש');
  });

  it('does not create a countdown without a date in the instruction', () => {
    const next = normalizeAdminAiCandidate(
      'countdown',
      { items: [{ title: 'טקס', targetDate: '2026-09-04T10:00:00' }] },
      { items: [], activeItemId: null },
      { instruction: 'צור ספירה לטקס' },
    );
    expect(next.items).toEqual([]);
  });

  it('does not invent outstanding identities or roles', () => {
    const next = normalizeAdminAiCandidate(
      'outstanding',
      { items: [{ name: 'שם מומצא', role: 'מפקד', description: 'תיאור' }] },
      [],
      { instruction: 'נסח הוקרה מהנקודות שסיפקתי' },
    );
    expect(next).toEqual([]);
  });

  it('does not promote an alert to urgent from the safety hint alone', () => {
    const next = normalizeAdminAiCandidate(
      'alerts',
      { items: [{ id: 'a1', title: 'עדכון', text: 'טקסט', isUrgent: true }] },
      [{ id: 'a1', title: 'עדכון', text: 'טקסט', isUrgent: false }],
      { instruction: 'הדגש פעולה נדרשת; אל תסמן קריטי אם אין לכך בסיס.' },
    );
    expect(next[0].isUrgent).toBe(false);
  });

  it('preserves attributed historical quotations during wording actions', () => {
    const current = [{ id: 'h1', quote: 'ציטוט מקורי', author: 'מחבר היסטורי', role: 'תפקיד' }];
    const next = normalizeAdminAiCandidate(
      'heritage',
      { items: [{ id: 'h1', quote: 'ציטוט משוכתב', author: 'מחבר אחר', role: 'תפקיד' }] },
      current,
      { actionId: 'shorten', instruction: 'קצר את המסר' },
    );
    expect(next[0].quote).toBe('ציטוט מקורי');
    expect(next[0].author).toBe('מחבר היסטורי');
  });

  it('normalizes existing org-chart roles while preserving identity fields', () => {
    const current = {
      nodes: [{
        id: 'n1',
        name: 'נועה',
        rank: 'סגן',
        role: 'מפקדת צוות',
        personalNumber: '1234567',
        imageUrl: '/images/noa.jpg',
        children: [],
      }],
    };
    const next = normalizeAdminAiCandidate(
      'org-chart',
      { nodes: [{ id: 'n1', name: 'שם מומצא', rank: 'סג״ם', role: 'מפקד/ת צוות', personalNumber: '9999999', children: [] }] },
      current,
      { actionId: 'normalize', instruction: 'אחד את ניסוחי הדרגות והתפקידים' },
    );
    expect(next.nodes[0]).toMatchObject({
      name: 'נועה',
      rank: 'סג״ם',
      role: 'מפקד/ת צוות',
      personalNumber: '1234567',
      imageUrl: '/images/noa.jpg',
    });
  });

  it('updates a Gantt owner only when the owner was supplied', () => {
    const current = {
      categories: [],
      items: [{ id: 't1', title: 'משימה', owner: 'נועה', startDate: '2026-09-01', endDate: '2026-09-02' }],
    };
    const ignored = normalizeAdminAiCandidate(
      'gantt',
      { items: [{ id: 't1', title: 'משימה', owner: 'שם מומצא', startDate: '2026-09-01', endDate: '2026-09-02' }] },
      current,
      { instruction: 'עדכן את תיאור המשימה' },
    );
    const replaced = normalizeAdminAiCandidate(
      'gantt',
      { items: [{ id: 't1', title: 'משימה', owner: 'דניאל', startDate: '2026-09-01', endDate: '2026-09-02' }] },
      current,
      { instruction: 'האחראי החדש הוא דניאל' },
    );
    expect(ignored.items[0].owner).toBe('נועה');
    expect(replaced.items[0].owner).toBe('דניאל');
  });

  it('does not invent dates for a new Gantt plan without a date basis', () => {
    const next = normalizeAdminAiCandidate(
      'gantt',
      {
        items: [{
          title: 'משימה חדשה',
          owner: '',
          startDate: '2026-10-01',
          endDate: '2026-10-03',
        }],
      },
      { categories: [], items: [] },
      { actionId: 'brief', instruction: 'צור תוכנית עבודה מהשלבים האלה' },
    );
    expect(next.items).toEqual([]);
  });

  it('normalizes BOOM task and summary-strip updates through the BOOM contract', () => {
    const current = {
      enabled: true,
      pageTitle: 'BOOM',
      design: { preset: 'operational', showSummaryStrip: true },
      categories: [{ id: 'general', name: 'כללי', color: '#2563eb', order: 1 }],
      items: [],
    };
    const next = normalizeAdminAiCandidate('boom', {
      boom: {
        design: {
          preset: 'command-center',
          showSummaryStrip: false,
          summaryMetrics: ['total', 'categories', 'invalid'],
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
      showSummaryStrip: false,
      summaryMetrics: ['total', 'categories'],
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
