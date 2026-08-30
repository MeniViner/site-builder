import { describe, expect, it } from 'vitest';
import { DEV_AI_ERROR_CODES } from './errors.js';
import { validateDevAiRequest } from './validation.js';

const HEBREW = 'צור שני מבזקים קצרים בעברית מהטקסט הבא';

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected ${code} to be thrown`);
}

describe('DEV AI server-side request validation', () => {
  it('accepts the exact payload the existing AIService already sends', () => {
    const parsed = validateDevAiRequest(
      {
        messages: [
          { role: 'system', content: 'אתה עורך תוכן לפורטל ארגוני.' },
          { role: 'user', content: HEBREW },
        ],
        model: 'any',
        stream: true,
      },
      { maxInputChars: 1000 },
    );

    expect(parsed.messageCount).toBe(2);
    expect(parsed.messages[1].content).toBe(HEBREW);
    expect(parsed.requestedModel).toBe('any');
    expect(parsed.requestedModelIsGeneric).toBe(true);
    expect(parsed.stream).toBe(true);
  });

  it('preserves Hebrew and JSON punctuation byte-for-byte', () => {
    const content = '{"status":"תקין","message":"מנוע ה-AI המקומי עובד בעברית"}\n```json\n{"a":1}\n```';
    const parsed = validateDevAiRequest({ messages: [{ role: 'user', content }] }, { maxInputChars: 5000 });
    expect(parsed.messages[0].content).toBe(content);
    expect(parsed.totalChars).toBe(content.length);
  });

  it('rejects a non-object body', () => {
    expectCode(() => validateDevAiRequest('nope', {}), DEV_AI_ERROR_CODES.INVALID_REQUEST);
    expectCode(() => validateDevAiRequest([], {}), DEV_AI_ERROR_CODES.INVALID_REQUEST);
  });

  it('rejects a missing or empty messages array', () => {
    expectCode(() => validateDevAiRequest({}, {}), DEV_AI_ERROR_CODES.INVALID_REQUEST);
    expectCode(() => validateDevAiRequest({ messages: [] }, {}), DEV_AI_ERROR_CODES.INVALID_REQUEST);
  });

  it('rejects unsupported roles', () => {
    expectCode(
      () => validateDevAiRequest({ messages: [{ role: 'root', content: 'x' }] }, {}),
      DEV_AI_ERROR_CODES.INVALID_REQUEST,
    );
  });

  it('rejects non-string or blank content', () => {
    expectCode(
      () => validateDevAiRequest({ messages: [{ role: 'user', content: 42 }] }, {}),
      DEV_AI_ERROR_CODES.INVALID_REQUEST,
    );
    expectCode(
      () => validateDevAiRequest({ messages: [{ role: 'user', content: '   ' }] }, {}),
      DEV_AI_ERROR_CODES.INVALID_REQUEST,
    );
  });

  it('requires at least one user message', () => {
    expectCode(
      () => validateDevAiRequest({ messages: [{ role: 'system', content: 'only a system prompt' }] }, {}),
      DEV_AI_ERROR_CODES.INVALID_REQUEST,
    );
  });

  it('enforces the server-side aggregate character budget', () => {
    const error = expectCode(
      () => validateDevAiRequest(
        { messages: [{ role: 'user', content: 'x'.repeat(101) }] },
        { maxInputChars: 100 },
      ),
      DEV_AI_ERROR_CODES.INPUT_TOO_LARGE,
    );
    expect(error.status).toBe(413);
    expect(error.message).toContain('101');
  });

  it('rejects a non-string model field', () => {
    expectCode(
      () => validateDevAiRequest({ messages: [{ role: 'user', content: 'x' }], model: 7 }, {}),
      DEV_AI_ERROR_CODES.INVALID_REQUEST,
    );
  });
});
