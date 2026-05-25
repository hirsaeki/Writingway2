// Normalized AI Gateway event helpers.
(function () {
    function nowIso() {
        return new Date().toISOString();
    }

    function base(type, data) {
        return Object.assign({ type, timestamp: nowIso() }, data || {});
    }

    function start(runId, data) {
        return base('start', Object.assign({ runId }, data || {}));
    }

    function textDelta(text, data) {
        return base('text_delta', Object.assign({ text: text || '' }, data || {}));
    }

    function jsonDelta(text, data) {
        return base('json_delta', Object.assign({ text: text || '' }, data || {}));
    }

    function toolCall(toolCallData, data) {
        return base('tool_call', Object.assign({ toolCall: toolCallData || {} }, data || {}));
    }

    function structuredResult(outputJson, data) {
        return base('structured_result', Object.assign({ outputJson: outputJson || null }, data || {}));
    }

    function usage(usageData, data) {
        return base('usage', Object.assign({ usage: usageData || {} }, data || {}));
    }

    function done(result, data) {
        return base('done', Object.assign({
            outputText: result?.outputText || '',
            outputJson: result?.outputJson || null,
            raw: result?.raw || null,
            finishReason: result?.finishReason || null
        }, data || {}));
    }

    function error(errorData, data) {
        const source = errorData || {};
        return base('error', Object.assign({
            error: {
                message: source.message || String(source),
                provider: source.provider || null,
                status: source.status || null
            }
        }, data || {}));
    }

    window.AIEvents = {
        start,
        textDelta,
        jsonDelta,
        toolCall,
        structuredResult,
        usage,
        done,
        error
    };
})();
