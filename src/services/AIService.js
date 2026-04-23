import { AI_CONFIG } from '../config/ai.config';

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function uniq(values) {
    const result = [];
    values.forEach((value) => {
        if (hasText(value) && !result.includes(value.trim())) {
            result.push(value.trim());
        }
    });
    return result;
}

class AIService {
    constructor(config = AI_CONFIG) {
        this.config = config;
    }

    isEnabled() {
        return Boolean(this.config.enabled);
    }

    async health(options = {}) {
        return this._requestJson('/health', {
            method: 'GET',
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });
    }

    async init(options = {}) {
        return this._requestJson('/init', {
            method: 'GET',
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });
    }

    async direct(prompt, model = this.config.defaultModel, options = {}) {
        this._assertPrompt(prompt);
        if (!hasText(model)) {
            throw new Error('AIService.direct requires a valid model name');
        }

        return this._requestJson(`/ai/direct/${encodeURIComponent(model)}`, {
            method: 'POST',
            body: {
                messages: [{ role: 'user', content: prompt }],
                stream: false,
            },
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });
    }

    async smart(prompt, options = {}) {
        this._assertPrompt(prompt);
        return this._requestJson('/ai/smart', {
            method: 'POST',
            body: {
                messages: [{ role: 'user', content: prompt }],
                stream: false,
            },
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });
    }

    async ask(prompt, options = {}) {
        this._assertPrompt(prompt);

        const requestMode = String(options.requestMode || this.config.requestMode || 'direct')
            .trim()
            .toLowerCase();

        if (requestMode === 'smart') {
            const smartResult = await this.smart(prompt, options);
            return {
                ...smartResult,
                strategy: 'smart',
                fallbackUsed: true,
                attemptedModels: [],
            };
        }

        const attemptedModels = [];
        const modelsToTry = this._resolveModelSequence(options.model, options.fallbackModels);
        const useSmartFallback = options.useSmartFallback ?? this.config.useSmartFallback;
        let lastError = null;

        for (const model of modelsToTry) {
            attemptedModels.push(model);
            try {
                const result = await this.direct(prompt, model, options);
                return {
                    ...result,
                    strategy: attemptedModels.length > 1 ? 'direct-with-fallback' : 'direct',
                    fallbackUsed: attemptedModels.length > 1,
                    attemptedModels,
                };
            } catch (error) {
                lastError = error;

                if (!this._shouldContinueFallback(error)) {
                    throw error;
                }
            }
        }

        if (useSmartFallback) {
            try {
                const smartResult = await this.smart(prompt, options);
                return {
                    ...smartResult,
                    strategy: 'smart-fallback',
                    fallbackUsed: true,
                    attemptedModels,
                };
            } catch (smartError) {
                smartError.previousError = lastError;
                smartError.attemptedModels = attemptedModels;
                throw smartError;
            }
        }

        const error = lastError || new Error('AI request failed and no fallback model succeeded');
        error.attemptedModels = attemptedModels;
        throw error;
    }

    async stream(prompt, options = {}) {
        this._assertPrompt(prompt);

        const model = hasText(options.model) ? options.model.trim() : this.config.streamModel;
        const timeoutMs = options.timeoutMs || this.config.streamTimeoutMs;
        const url = `${this.config.apiBase}/ai/stream`;
        const merged = this._createSignal(timeoutMs, options.signal);
        const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
        const onToken = typeof options.onToken === 'function' ? options.onToken : null;
        const onDone = typeof options.onDone === 'function' ? options.onDone : null;

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: this._createHeaders(),
                body: JSON.stringify({ prompt, model }),
                signal: merged.signal,
            });
        } catch (error) {
            merged.cleanup();
            throw this._normalizeNetworkError(error, timeoutMs);
        }

        if (!response.ok) {
            const payload = await this._parseResponseBody(response);
            merged.cleanup();
            throw this._createHttpError(response, payload);
        }

        if (!response.body) {
            merged.cleanup();
            throw new Error('Stream response is missing body');
        }

        const modelUsed = response.headers.get('x-proxy-model') || model;
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let pending = '';
        let content = '';
        let eventsCount = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                pending += decoder.decode(value, { stream: true });
                const lines = pending.split(/\r?\n/);
                pending = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine.startsWith('data:')) {
                        continue;
                    }

                    const payload = trimmedLine.slice(5).trim();
                    if (!payload) {
                        continue;
                    }

                    if (payload === '[DONE]') {
                        if (onDone) {
                            onDone({ modelUsed, content });
                        }
                        return { modelUsed, content, eventsCount };
                    }

                    eventsCount += 1;
                    const token = this._extractToken(payload);
                    if (token) {
                        content += token;
                        if (onToken) {
                            onToken(token, { modelUsed, raw: payload });
                        }
                    }

                    if (onEvent) {
                        onEvent(payload, { modelUsed, token });
                    }
                }
            }

            if (onDone) {
                onDone({ modelUsed, content });
            }

            return { modelUsed, content, eventsCount };
        } catch (error) {
            throw this._normalizeNetworkError(error, timeoutMs);
        } finally {
            merged.cleanup();
        }
    }

    _resolveModelSequence(primaryModel, fallbackModels = null) {
        const requestedModel = hasText(primaryModel) ? primaryModel.trim() : this.config.defaultModel;
        const explicitFallback = Array.isArray(fallbackModels)
            ? fallbackModels
            : this.config.fallbackModels;

        return uniq([requestedModel, ...(explicitFallback || [])]);
    }

    _shouldContinueFallback(error) {
        if (!error) {
            return false;
        }

        if (error.status && [401, 403, 404].includes(error.status)) {
            return false;
        }

        return true;
    }

    _assertPrompt(prompt) {
        if (!hasText(prompt)) {
            throw new Error('prompt must be a non-empty string');
        }
    }

    _createHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders,
        };

        if (hasText(this.config.apiToken)) {
            headers['x-api-token'] = this.config.apiToken;
        }

        return headers;
    }

    _createSignal(timeoutMs, userSignal) {
        const controller = new AbortController();
        let timeoutId = null;
        let removed = false;

        const onUserAbort = () => {
            controller.abort(userSignal?.reason || new DOMException('Aborted', 'AbortError'));
        };

        if (userSignal) {
            if (userSignal.aborted) {
                controller.abort(userSignal.reason || new DOMException('Aborted', 'AbortError'));
            } else {
                userSignal.addEventListener('abort', onUserAbort, { once: true });
            }
        }

        if (timeoutMs && timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        }

        return {
            signal: controller.signal,
            cleanup: () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (!removed && userSignal) {
                    userSignal.removeEventListener('abort', onUserAbort);
                    removed = true;
                }
            },
        };
    }

    async _requestJson(path, options = {}) {
        const timeoutMs = options.timeoutMs || this.config.requestTimeoutMs;
        const url = `${this.config.apiBase}${path}`;
        const merged = this._createSignal(timeoutMs, options.signal);

        let response;
        try {
            response = await fetch(url, {
                method: options.method || 'GET',
                headers: this._createHeaders(options.headers),
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: merged.signal,
            });
        } catch (error) {
            merged.cleanup();
            throw this._normalizeNetworkError(error, timeoutMs);
        }

        const payload = await this._parseResponseBody(response);
        merged.cleanup();

        if (!response.ok) {
            throw this._createHttpError(response, payload);
        }

        return payload;
    }

    async _parseResponseBody(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch {
                return {};
            }
        }

        const text = await response.text();
        return { raw: text };
    }

    _createHttpError(response, payload) {
        const serverErrorText =
            (payload && (payload.error || payload.message || payload.raw)) || response.statusText;
        const error = new Error(`AI API error ${response.status}: ${serverErrorText}`);
        error.status = response.status;
        error.payload = payload;
        return error;
    }

    _normalizeNetworkError(error, timeoutMs) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(`AI request timed out after ${timeoutMs}ms`);
            timeoutError.code = 'TIMEOUT';
            return timeoutError;
        }
        return error;
    }

    _extractToken(payload) {
        let parsed;
        try {
            parsed = JSON.parse(payload);
        } catch {
            return '';
        }

        if (typeof parsed?.choices?.[0]?.delta?.content === 'string') {
            return parsed.choices[0].delta.content;
        }

        if (typeof parsed?.delta?.text === 'string') {
            return parsed.delta.text;
        }

        if (typeof parsed?.content_block?.text === 'string') {
            return parsed.content_block.text;
        }

        return '';
    }
}

export default new AIService();
