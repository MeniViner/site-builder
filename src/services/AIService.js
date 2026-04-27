import { AI_CONFIG } from '../config/ai.config';

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized || 'user';
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

    async ask(prompt, options = {}) {
        this._assertPrompt(prompt);
        return this.stream(prompt, options);
    }

    async direct(prompt, model = this.config.defaultModel, options = {}) {
        this._assertPrompt(prompt);
        return this.stream(prompt, { ...options, model });
    }

    async stream(prompt, options = {}) {
        this._assertPrompt(prompt);

        const model = hasText(options.model)
            ? options.model.trim()
            : (this.config.streamModel || this.config.defaultModel || 'any');
        const timeoutMs = options.timeoutMs || this.config.streamTimeoutMs;
        const streamPath = this._resolveStreamPath(options.streamPath);
        const url = `${this.config.apiBase}${streamPath}`;
        const merged = this._createSignal(timeoutMs, options.signal);
        const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
        const onToken = typeof options.onToken === 'function' ? options.onToken : null;
        const onDone = typeof options.onDone === 'function' ? options.onDone : null;
        const messages = this._normalizeMessages(prompt, options.messages);
        const payload = {
            messages,
            stream: true,
        };

        if (hasText(model)) {
            payload.model = model;
        }

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: this._createHeaders(),
                body: JSON.stringify(payload),
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

        const handleEventChunk = (eventChunk) => {
            const rawPayload = this._extractPayloadFromSseEvent(eventChunk);
            if (!rawPayload) {
                return false;
            }

            if (rawPayload === '[DONE]') {
                if (onDone) {
                    onDone({ modelUsed, content });
                }
                return true;
            }

            eventsCount += 1;
            const parsed = this._safeParseJson(rawPayload);
            const token = this._extractToken(parsed);

            if (token) {
                content += token;
                if (onToken) {
                    onToken(token, { modelUsed, raw: rawPayload, parsed });
                }
            }

            if (onEvent) {
                onEvent(rawPayload, { modelUsed, token, parsed });
            }

            if (parsed?.error) {
                const upstreamError = new Error(parsed.error?.message || 'Streaming response returned an error event');
                upstreamError.payload = parsed;
                throw upstreamError;
            }

            return false;
        };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                pending += decoder.decode(value, { stream: true });
                const chunks = pending.split(/\r?\n\r?\n/);
                pending = chunks.pop() || '';

                for (const chunk of chunks) {
                    const shouldStop = handleEventChunk(chunk);
                    if (shouldStop) {
                        return { modelUsed, content, eventsCount };
                    }
                }
            }

            if (pending.trim()) {
                const shouldStop = handleEventChunk(pending);
                if (shouldStop) {
                    return { modelUsed, content, eventsCount };
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

    _resolveStreamPath(streamPath) {
        const resolved = hasText(streamPath)
            ? streamPath.trim()
            : (hasText(this.config.streamEndpoint) ? this.config.streamEndpoint.trim() : '/ai/stream');
        if (!resolved.startsWith('/')) {
            return `/${resolved}`;
        }
        return resolved;
    }

    _normalizeMessages(prompt, providedMessages) {
        if (Array.isArray(providedMessages) && providedMessages.length > 0) {
            const messages = providedMessages
                .map((message) => ({
                    role: normalizeRole(message?.role),
                    content: String(message?.content || '').trim(),
                }))
                .filter((message) => message.content.length > 0);
            if (messages.length > 0) {
                return messages;
            }
        }

        return [{ role: 'user', content: prompt.trim() }];
    }

    _extractPayloadFromSseEvent(eventChunk) {
        const lines = String(eventChunk || '').split(/\r?\n/);
        const dataLines = [];

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith(':')) {
                continue;
            }
            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }

        if (dataLines.length === 0) {
            return '';
        }

        return dataLines.join('\n').trim();
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

    _safeParseJson(rawPayload) {
        try {
            return JSON.parse(rawPayload);
        } catch {
            return null;
        }
    }

    _extractToken(parsed) {
        if (!parsed || typeof parsed !== 'object') {
            return '';
        }
        if (typeof parsed?.choices?.[0]?.delta?.content === 'string') {
            return parsed.choices[0].delta.content;
        }

        if (typeof parsed?.choices?.[0]?.message?.content === 'string') {
            return parsed.choices[0].message.content;
        }

        if (typeof parsed?.choices?.[0]?.text === 'string') {
            return parsed.choices[0].text;
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
