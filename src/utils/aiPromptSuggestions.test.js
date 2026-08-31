import { describe, expect, it } from 'vitest';
import { ADMIN_AI_CAPABILITIES } from './adminAiCapabilities';
import {
  AI_PROMPT_SUGGESTIONS,
  getAiPromptSuggestions,
  pickAiPromptSuggestion,
} from './aiPromptSuggestions';

describe('aiPromptSuggestions registry', () => {
  it('is exported as an immutable object', () => {
    expect(Object.isFrozen(AI_PROMPT_SUGGESTIONS)).toBe(true);
    expect(Object.isFrozen(AI_PROMPT_SUGGESTIONS.news)).toBe(true);
    expect(Object.isFrozen(AI_PROMPT_SUGGESTIONS.news.default)).toBe(true);
    expect(() => {
      AI_PROMPT_SUGGESTIONS.news.default.push('x');
    }).toThrow();
  });

  it('covers every ADMIN_AI_CAPABILITIES surface with at least 3 default suggestions', () => {
    for (const surfaceKey of Object.keys(ADMIN_AI_CAPABILITIES)) {
      const suggestions = getAiPromptSuggestions(surfaceKey);
      expect(suggestions.length, `surface "${surfaceKey}" should have suggestions`).toBeGreaterThanOrEqual(3);
    }
  });

  it('provides suggestions for the standalone org-chart-import surface', () => {
    const suggestions = getAiPromptSuggestions('org-chart-import');
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('provides at least 3 action-specific suggestions for every configured action', () => {
    const surfacesWithMissingActionPools = [];
    for (const [surfaceKey, capability] of Object.entries(ADMIN_AI_CAPABILITIES)) {
      for (const action of capability.actions) {
        const entry = AI_PROMPT_SUGGESTIONS[surfaceKey];
        const actionList = entry && entry.actions && entry.actions[action.id];
        if (!Array.isArray(actionList) || actionList.length < 3) {
          surfacesWithMissingActionPools.push(`${surfaceKey}:${action.id}`);
        }
      }
    }
    expect(surfacesWithMissingActionPools).toEqual([]);
  });

  it('never returns duplicate suggestions within a single list', () => {
    for (const [surfaceKey, capability] of Object.entries(ADMIN_AI_CAPABILITIES)) {
      const defaultList = getAiPromptSuggestions(surfaceKey);
      expect(new Set(defaultList).size).toBe(defaultList.length);
      for (const action of capability.actions) {
        const actionList = getAiPromptSuggestions(surfaceKey, action.id);
        expect(new Set(actionList).size).toBe(actionList.length);
      }
    }
  });

  it('never phrases a suggestion as an instruction to the user instead of a direct AI prompt', () => {
    // Hebrew letters are not \w, so "\b" word boundaries don't work reliably;
    // matching on surrounding whitespace/string edges instead.
    const metaPhrasingPattern = /ובקש|(?:^|\s)בקש(?:\s|$)/;
    const offendingStrings = [];

    for (const [surfaceKey, entry] of Object.entries(AI_PROMPT_SUGGESTIONS)) {
      for (const suggestion of entry.default || []) {
        if (metaPhrasingPattern.test(suggestion)) {
          offendingStrings.push(`${surfaceKey}.default: "${suggestion}"`);
        }
      }
      for (const [actionId, actionList] of Object.entries(entry.actions || {})) {
        for (const suggestion of actionList) {
          if (metaPhrasingPattern.test(suggestion)) {
            offendingStrings.push(`${surfaceKey}.actions.${actionId}: "${suggestion}"`);
          }
        }
      }
    }

    expect(offendingStrings).toEqual([]);
  });
});

describe('getAiPromptSuggestions resolution', () => {
  it('resolves the surface default when no action is given', () => {
    const suggestions = getAiPromptSuggestions('news');
    expect(suggestions).toEqual(AI_PROMPT_SUGGESTIONS.news.default);
  });

  it('prefers action-specific suggestions over the surface default', () => {
    const actionSuggestions = getAiPromptSuggestions('news', 'translate');
    expect(actionSuggestions).toEqual(AI_PROMPT_SUGGESTIONS.news.actions.translate);
    expect(actionSuggestions).not.toEqual(AI_PROMPT_SUGGESTIONS.news.default);
  });

  it('falls back to the surface default for an unknown action key', () => {
    const suggestions = getAiPromptSuggestions('news', 'not-a-real-action');
    expect(suggestions).toEqual(AI_PROMPT_SUGGESTIONS.news.default);
  });

  it('strips a "widget:" prefix so widget surfaces resolve like their base surface', () => {
    expect(getAiPromptSuggestions('widget:news')).toEqual(getAiPromptSuggestions('news'));
    expect(getAiPromptSuggestions('widget:polls', 'create')).toEqual(getAiPromptSuggestions('polls', 'create'));
  });

  it('resolves the standalone org-chart-import surface independently of org-chart', () => {
    const importSuggestions = getAiPromptSuggestions('org-chart-import');
    const orgChartSuggestions = getAiPromptSuggestions('org-chart');
    expect(importSuggestions.length).toBeGreaterThanOrEqual(3);
    expect(importSuggestions).not.toEqual(orgChartSuggestions);
  });

  it('supports the custom "generate" action used by AdminEvents on the events surface', () => {
    const generateSuggestions = getAiPromptSuggestions('events', 'generate');
    expect(generateSuggestions.length).toBeGreaterThanOrEqual(3);
    expect(generateSuggestions).toEqual(AI_PROMPT_SUGGESTIONS.events.actions.generate);
    expect(generateSuggestions).not.toEqual(getAiPromptSuggestions('events', 'paste'));
    expect(generateSuggestions).not.toEqual(getAiPromptSuggestions('events'));
  });

  it('resolves widget:events with the "generate" action just like the bare events surface', () => {
    expect(getAiPromptSuggestions('widget:events', 'generate')).toEqual(
      getAiPromptSuggestions('events', 'generate')
    );
  });

  it('returns an empty array for an unknown surface that is not a recognized admin capability', () => {
    expect(getAiPromptSuggestions('totally-unknown-surface')).toEqual([]);
  });

  it('returns an empty array for non-string surface keys', () => {
    expect(getAiPromptSuggestions(undefined)).toEqual([]);
    expect(getAiPromptSuggestions(null)).toEqual([]);
    expect(getAiPromptSuggestions(42)).toEqual([]);
  });

  it('never mutates the underlying registry when returning suggestions', () => {
    const first = getAiPromptSuggestions('news');
    first.push('injected suggestion');
    const second = getAiPromptSuggestions('news');
    expect(second).toEqual(AI_PROMPT_SUGGESTIONS.news.default);
    expect(second).not.toContain('injected suggestion');
  });

  describe('News/Polls/Events/Countdown context handling', () => {
    it('adds a safe News suggestion echoing a supplied source language for translate', () => {
      const withContext = getAiPromptSuggestions('news', 'translate', { sourceLanguage: 'ספרדית' });
      const withoutContext = getAiPromptSuggestions('news', 'translate');
      expect(withContext.length).toBe(withoutContext.length + 1);
      expect(withContext[0]).toContain('ספרדית');
      expect(withoutContext.every((s) => !s.includes('ספרדית'))).toBe(true);
    });

    it('adds a safe Polls suggestion echoing a supplied active question for rewrite actions', () => {
      const question = 'האם יש לעדכן את שעות המשמרת?';
      const withContext = getAiPromptSuggestions('polls', 'rewrite', { activeQuestion: question });
      expect(withContext[0]).toContain(question);
      expect(withContext[0]).toContain('נתוני ההצבעה');

      const rewriteBias = getAiPromptSuggestions('polls', 'rewrite-bias', { activeQuestion: question });
      expect(rewriteBias[0]).toContain(question);
    });

    it('does not add a Polls context suggestion for unrelated actions', () => {
      const question = 'האם יש לעדכן את שעות המשמרת?';
      const createList = getAiPromptSuggestions('polls', 'create', { activeQuestion: question });
      expect(createList).toEqual(AI_PROMPT_SUGGESTIONS.polls.actions.create);
    });

    it('adds a safe Events suggestion echoing a supplied month label for reuse', () => {
      const withContext = getAiPromptSuggestions('events', 'reuse', { monthLabel: 'אוגוסט' });
      expect(withContext[0]).toContain('אוגוסט');
      expect(withContext.length).toBe(AI_PROMPT_SUGGESTIONS.events.actions.reuse.length + 1);
    });

    it('adds a safe Countdown suggestion echoing a supplied event label without inventing a date', () => {
      const withContext = getAiPromptSuggestions('countdown', 'event', { eventLabel: 'טקס סיום קורס' });
      expect(withContext[0]).toContain('טקס סיום קורס');
      expect(withContext[0]).not.toMatch(/\d{1,2}\.\d{1,2}(\.\d{2,4})?/);
    });

    it('ignores context objects with unrelated or missing keys', () => {
      const suggestions = getAiPromptSuggestions('news', 'translate', { unrelated: 'value' });
      expect(suggestions).toEqual(AI_PROMPT_SUGGESTIONS.news.actions.translate);
    });

    it('ignores non-object context values gracefully', () => {
      expect(getAiPromptSuggestions('news', 'translate', null)).toEqual(AI_PROMPT_SUGGESTIONS.news.actions.translate);
      expect(getAiPromptSuggestions('news', 'translate', 'a string')).toEqual(AI_PROMPT_SUGGESTIONS.news.actions.translate);
    });
  });
});

describe('pickAiPromptSuggestion', () => {
  it('returns an empty string when there are no options', () => {
    expect(pickAiPromptSuggestion([], '', () => 0.5)).toBe('');
    expect(pickAiPromptSuggestion(undefined, '', () => 0.5)).toBe('');
  });

  it('returns the only option when exactly one is available, even if it matches the previous suggestion', () => {
    expect(pickAiPromptSuggestion(['only one'], 'only one', () => 0.5)).toBe('only one');
    expect(pickAiPromptSuggestion(['only one'], '', () => 0.5)).toBe('only one');
  });

  it('avoids repeating the previous suggestion when 2+ options are available', () => {
    const options = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i += 1) {
      const random = () => i / 20;
      const picked = pickAiPromptSuggestion(options, 'a', random);
      expect(picked).not.toBe('a');
      expect(options).toContain(picked);
    }
  });

  it('returns an available option from the pool for every random draw', () => {
    const options = ['a', 'b', 'c', 'd'];
    for (const random of [() => 0, () => 0.25, () => 0.5, () => 0.75, () => 0.999]) {
      const picked = pickAiPromptSuggestion(options, '', random);
      expect(options).toContain(picked);
    }
  });

  it('is deterministic for a given injected random function', () => {
    const options = ['a', 'b', 'c', 'd'];
    const random = () => 0.6;
    const first = pickAiPromptSuggestion(options, '', random);
    const second = pickAiPromptSuggestion(options, '', random);
    expect(first).toBe(second);
  });

  it('does not mutate the input options array', () => {
    const options = ['a', 'b', 'c'];
    const snapshot = [...options];
    pickAiPromptSuggestion(options, 'a', () => 0.9);
    expect(options).toEqual(snapshot);
  });

  it('falls back to the full pool when the previous suggestion is not part of the options', () => {
    const options = ['a', 'b', 'c'];
    const picked = pickAiPromptSuggestion(options, 'not-in-pool', () => 0);
    expect(options).toContain(picked);
  });

  it('clamps out-of-range random values into a valid index', () => {
    const options = ['a', 'b', 'c'];
    expect(options).toContain(pickAiPromptSuggestion(options, '', () => 0.999999));
    expect(options).toContain(pickAiPromptSuggestion(options, '', () => 1));
    expect(options).toContain(pickAiPromptSuggestion(options, '', () => -1));
    expect(options).toContain(pickAiPromptSuggestion(options, '', () => Number.NaN));
  });

  it('works end to end with real registry suggestions and never repeats immediately', () => {
    const options = getAiPromptSuggestions('news', 'flash');
    let previous = '';
    for (let i = 0; i < 10; i += 1) {
      const next = pickAiPromptSuggestion(options, previous, () => (i % 7) / 7);
      expect(options).toContain(next);
      if (options.length > 1) expect(next).not.toBe(previous);
      previous = next;
    }
  });
});
