// Structured JSON parsing, lightweight schema validation, and repair hooks.
(function () {
    const PLOT_PLAN_SCHEMA_ID = 'https://writingway.local/schemas/plot-plan.schema.json';
    const BEAT_TEMPLATE_SCHEMA_ID = 'https://writingway.local/schemas/beat-template-v2.schema.json';

    const PLOT_PLAN_SCHEMA = {
        $id: PLOT_PLAN_SCHEMA_ID,
        title: 'Writingway 2 Plot Plan',
        type: 'object',
        required: ['templateId', 'name', 'premise', 'beats'],
        additionalProperties: true,
        properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            templateId: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['draft', 'reviewed', 'accepted', 'archived'] },
            premise: { type: 'string' },
            genre: { type: 'string' },
            targetLength: { type: 'string' },
            tone: { type: 'string' },
            medium: { type: 'string', enum: ['novel', 'screenplay', 'shortStory', 'manga', 'game', 'general'] },
            source: { type: 'string', enum: ['user', 'ai', 'imported'] },
            beats: { type: 'array', minItems: 1, items: { $ref: '#/$defs/PlotBeat' } },
            aiRunId: { type: 'string' },
            created: {},
            modified: {},
            updatedAt: { type: ['number', 'integer'] }
        },
        $defs: {
            PlotBeat: {
                type: 'object',
                required: ['slotId', 'slotTitle', 'title', 'summary'],
                additionalProperties: true,
                properties: {
                    id: { type: 'string' },
                    slotId: { type: 'string', minLength: 1 },
                    slotTitle: { type: 'string', minLength: 1 },
                    title: { type: 'string', minLength: 1 },
                    summary: { type: 'string', minLength: 1 },
                    characterArc: { type: 'string' },
                    conflict: { type: 'string' },
                    sceneIdeas: { type: 'array', items: { type: 'string' } },
                    openQuestions: { type: 'array', items: { type: 'string' } },
                    tags: { type: 'array', items: { type: 'string' } },
                    selected: { type: 'boolean' }
                }
            }
        }
    };

    const BEAT_TEMPLATE_V2_SCHEMA = {
        $id: BEAT_TEMPLATE_SCHEMA_ID,
        title: 'Writingway 2 Beat Template Export v2',
        type: 'object',
        required: ['format', 'version', 'exportedAt', 'template'],
        additionalProperties: false,
        properties: {
            format: { const: 'writingway2.beat-template' },
            version: { const: 2 },
            exportedAt: { type: 'string', format: 'date-time' },
            template: { $ref: '#/$defs/BeatTemplate' }
        },
        $defs: {
            BeatTemplate: {
                type: 'object',
                required: ['id', 'name', 'version', 'source', 'slots'],
                additionalProperties: true,
                properties: {
                    id: { type: 'string', minLength: 1 },
                    name: { type: 'string', minLength: 1 },
                    version: { const: 2 },
                    builtIn: { type: 'boolean' },
                    source: { type: 'string', enum: ['builtIn', 'custom', 'imported', 'aiCustomized'] },
                    baseTemplateId: { type: 'string' },
                    description: { type: 'string' },
                    medium: { type: 'string', enum: ['novel', 'screenplay', 'shortStory', 'manga', 'game', 'general'] },
                    tags: { type: 'array', items: { type: 'string' } },
                    slots: { type: 'array', minItems: 1, items: { $ref: '#/$defs/BeatTemplateSlot' } },
                    customization: {
                        type: 'object',
                        additionalProperties: true,
                        properties: {
                            instruction: { type: 'string' },
                            changeSummary: { type: 'array', items: { type: 'string' } },
                            aiRunId: { type: 'string' }
                        }
                    },
                    created: {},
                    modified: {},
                    updatedAt: { type: ['number', 'integer'] }
                }
            },
            BeatTemplateSlot: {
                type: 'object',
                required: ['id', 'title', 'order', 'description', 'purpose'],
                additionalProperties: true,
                properties: {
                    id: { type: 'string', minLength: 1 },
                    title: { type: 'string', minLength: 1 },
                    order: { type: 'integer', minimum: 0 },
                    description: { type: 'string' },
                    purpose: { type: 'string' },
                    recommendedPosition: {
                        anyOf: [
                            { type: 'null' },
                            {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    percentStart: { type: 'number', minimum: 0, maximum: 100 },
                                    percentEnd: { type: 'number', minimum: 0, maximum: 100 }
                                }
                            }
                        ]
                    },
                    promptHint: { type: 'string' },
                    requiredInputs: { type: 'array', items: { type: 'string' } },
                    outputSchema: {
                        anyOf: [
                            { type: 'null' },
                            { type: 'object' }
                        ]
                    },
                    examples: { type: 'array', items: { type: 'string' } }
                }
            }
        }
    };

    const SCHEMA_REGISTRY = {
        plotPlan: PLOT_PLAN_SCHEMA,
        'plot-plan': PLOT_PLAN_SCHEMA,
        [PLOT_PLAN_SCHEMA_ID]: PLOT_PLAN_SCHEMA,
        beatTemplateV2: BEAT_TEMPLATE_V2_SCHEMA,
        'beat-template-v2': BEAT_TEMPLATE_V2_SCHEMA,
        [BEAT_TEMPLATE_SCHEMA_ID]: BEAT_TEMPLATE_V2_SCHEMA
    };

    function tr(key, params, fallback) {
        return window.t ? window.t(key, params, fallback) : (fallback || key);
    }

    function makeError(code, message, data) {
        const error = new Error(message);
        error.code = code;
        Object.assign(error, data || {});
        return error;
    }

    function asText(value) {
        if (typeof value === 'string') return value;
        if (value == null) return '';
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    function stripCodeFence(text) {
        const trimmed = asText(text).trim();
        const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        return match ? match[1].trim() : trimmed;
    }

    function extractJsonCandidate(text) {
        const stripped = stripCodeFence(text);
        if (!stripped) return '';
        if (stripped[0] === '{' || stripped[0] === '[') return stripped;

        const firstObject = stripped.indexOf('{');
        const firstArray = stripped.indexOf('[');
        const starts = [firstObject, firstArray].filter(index => index >= 0);
        if (starts.length === 0) return stripped;
        const first = Math.min(...starts);
        const lastObject = stripped.lastIndexOf('}');
        const lastArray = stripped.lastIndexOf(']');
        const last = Math.max(lastObject, lastArray);
        return last >= first ? stripped.slice(first, last + 1).trim() : stripped;
    }

    function parseJsonSafely(text) {
        const rawText = asText(text);
        const jsonText = extractJsonCandidate(rawText);
        try {
            return {
                ok: true,
                value: JSON.parse(jsonText),
                rawText,
                jsonText,
                error: null
            };
        } catch (error) {
            return {
                ok: false,
                value: null,
                rawText,
                jsonText,
                error: {
                    message: error.message,
                    code: 'invalid_json'
                }
            };
        }
    }

    function resolveSchema(schemaOrName) {
        if (!schemaOrName) return null;
        if (typeof schemaOrName === 'string') return SCHEMA_REGISTRY[schemaOrName] || null;
        if (schemaOrName.schema) return resolveSchema(schemaOrName.schema) || schemaOrName.schema;
        if (schemaOrName.$id && SCHEMA_REGISTRY[schemaOrName.$id]) return SCHEMA_REGISTRY[schemaOrName.$id];
        return schemaOrName;
    }

    function schemaLabel(schemaOrName) {
        const schema = resolveSchema(schemaOrName);
        if (!schema) return 'unknown';
        if (schema.$id === PLOT_PLAN_SCHEMA_ID) return 'plot-plan';
        if (schema.$id === BEAT_TEMPLATE_SCHEMA_ID) return 'beat-template-v2';
        return schema.title || schema.$id || 'custom';
    }

    function resolveRef(rootSchema, ref) {
        if (!ref || !ref.startsWith('#/')) return null;
        const parts = ref.slice(2).split('/');
        let current = rootSchema;
        for (const part of parts) {
            current = current && current[part];
        }
        return current || null;
    }

    function typeName(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (Number.isInteger(value)) return 'integer';
        return typeof value;
    }

    function matchesType(value, expectedType) {
        switch (expectedType) {
            case 'null':
                return value === null;
            case 'array':
                return Array.isArray(value);
            case 'object':
                return value !== null && typeof value === 'object' && !Array.isArray(value);
            case 'integer':
                return Number.isInteger(value);
            case 'number':
                return typeof value === 'number' && Number.isFinite(value);
            case 'string':
                return typeof value === 'string';
            case 'boolean':
                return typeof value === 'boolean';
            default:
                return true;
        }
    }

    function pathFor(base, key) {
        if (typeof key === 'number') return `${base}[${key}]`;
        return base === '$' ? `$.${key}` : `${base}.${key}`;
    }

    function addError(errors, path, message, code) {
        errors.push({ path, message, code: code || 'schema_invalid' });
    }

    function validateNode(value, schema, rootSchema, path, errors) {
        if (!schema || Object.keys(schema).length === 0) return;

        if (schema.$ref) {
            const resolved = resolveRef(rootSchema, schema.$ref);
            if (!resolved) {
                addError(errors, path, `Unresolved schema reference ${schema.$ref}`, 'schema_reference_missing');
                return;
            }
            validateNode(value, resolved, rootSchema, path, errors);
            return;
        }

        if (schema.anyOf) {
            const anyMatches = schema.anyOf.some(candidate => {
                const candidateErrors = [];
                validateNode(value, candidate, rootSchema, path, candidateErrors);
                return candidateErrors.length === 0;
            });
            if (!anyMatches) {
                addError(errors, path, 'Value does not match any allowed schema', 'anyOf');
            }
            return;
        }

        if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
            addError(errors, path, `Expected constant ${JSON.stringify(schema.const)}`, 'const');
            return;
        }

        if (schema.enum && !schema.enum.includes(value)) {
            addError(errors, path, `Expected one of ${schema.enum.join(', ')}`, 'enum');
            return;
        }

        if (schema.type) {
            const types = Array.isArray(schema.type) ? schema.type : [schema.type];
            if (!types.some(type => matchesType(value, type))) {
                addError(errors, path, `Expected ${types.join(' or ')}, got ${typeName(value)}`, 'type');
                return;
            }
        }

        if (typeof value === 'string') {
            if (schema.minLength !== undefined && value.length < schema.minLength) {
                addError(errors, path, `Expected at least ${schema.minLength} character(s)`, 'minLength');
            }
            return;
        }

        if (typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum) {
                addError(errors, path, `Expected number >= ${schema.minimum}`, 'minimum');
            }
            if (schema.maximum !== undefined && value > schema.maximum) {
                addError(errors, path, `Expected number <= ${schema.maximum}`, 'maximum');
            }
            return;
        }

        if (Array.isArray(value)) {
            if (schema.minItems !== undefined && value.length < schema.minItems) {
                addError(errors, path, `Expected at least ${schema.minItems} item(s)`, 'minItems');
            }
            if (schema.items) {
                value.forEach((item, index) => validateNode(item, schema.items, rootSchema, pathFor(path, index), errors));
            }
            return;
        }

        if (value && typeof value === 'object') {
            const required = Array.isArray(schema.required) ? schema.required : [];
            required.forEach(key => {
                if (!Object.prototype.hasOwnProperty.call(value, key)) {
                    addError(errors, pathFor(path, key), 'Required field is missing', 'required');
                }
            });

            if (schema.additionalProperties === false && schema.properties) {
                Object.keys(value).forEach(key => {
                    if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
                        addError(errors, pathFor(path, key), 'Additional properties are not allowed', 'additionalProperties');
                    }
                });
            }

            if (schema.properties) {
                for (const [key, childSchema] of Object.entries(schema.properties)) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        validateNode(value[key], childSchema, rootSchema, pathFor(path, key), errors);
                    }
                }
            }
        }
    }

    function validateJson(value, schemaOrName) {
        const schema = resolveSchema(schemaOrName);
        if (!schema) {
            return {
                ok: false,
                errors: [{ path: '$', message: 'Unknown response schema', code: 'schema_unknown' }],
                schema: null,
                schemaLabel: 'unknown'
            };
        }

        const errors = [];
        validateNode(value, schema, schema, '$', errors);
        return {
            ok: errors.length === 0,
            errors,
            schema,
            schemaLabel: schemaLabel(schema)
        };
    }

    function validateText(text, schemaOrName) {
        const parsed = parseJsonSafely(text);
        if (!parsed.ok) {
            return {
                ok: false,
                outputJson: null,
                rawText: parsed.rawText,
                jsonText: parsed.jsonText,
                parseError: parsed.error,
                validationErrors: [],
                errors: [parsed.error],
                schemaLabel: schemaLabel(schemaOrName)
            };
        }

        const validation = validateJson(parsed.value, schemaOrName);
        return {
            ok: validation.ok,
            outputJson: validation.ok ? parsed.value : null,
            rawText: parsed.rawText,
            jsonText: parsed.jsonText,
            parseError: null,
            validationErrors: validation.errors,
            errors: validation.errors,
            schema: validation.schema,
            schemaLabel: validation.schemaLabel
        };
    }

    function summarizeErrors(errors, limit = 4) {
        const list = Array.isArray(errors) ? errors : [];
        if (list.length === 0) return 'unknown validation error';
        const shown = list.slice(0, limit).map(error => `${error.path || '$'}: ${error.message || error.code || 'invalid'}`);
        if (list.length > limit) shown.push(`${list.length - limit} more error(s)`);
        return shown.join('; ');
    }

    function buildRepairPrompt(rawText, errors, schemaOrName) {
        const schema = resolveSchema(schemaOrName);
        return [
            {
                role: 'system',
                content: 'Return only corrected JSON. Do not include markdown fences or explanatory text.'
            },
            {
                role: 'user',
                content: [
                    'The following AI output failed JSON/schema validation.',
                    '',
                    'Validation errors:',
                    summarizeErrors(errors, 12),
                    '',
                    'Expected JSON Schema:',
                    JSON.stringify(schema || schemaOrName, null, 2),
                    '',
                    'Invalid output:',
                    asText(rawText)
                ].join('\n')
            }
        ];
    }

    async function processWithRepair(rawText, schemaOrName, options = {}) {
        const first = validateText(rawText, schemaOrName);
        if (first.ok) {
            return Object.assign({}, first, {
                repaired: false,
                repairAttempted: false
            });
        }

        const repair = options.repair || options.repairStructuredOutput;
        if (typeof repair !== 'function') {
            return Object.assign({}, first, {
                repaired: false,
                repairAttempted: false,
                repairError: {
                    message: 'No structured-output repair hook is configured',
                    code: 'repair_unavailable'
                }
            });
        }

        let repairedOutput;
        try {
            repairedOutput = await repair({
                rawText,
                schema: resolveSchema(schemaOrName),
                schemaLabel: schemaLabel(schemaOrName),
                errors: first.errors,
                messages: buildRepairPrompt(rawText, first.errors, schemaOrName)
            });
        } catch (error) {
            return Object.assign({}, first, {
                repaired: false,
                repairAttempted: true,
                repairError: {
                    message: error && error.message ? error.message : String(error),
                    code: 'repair_failed'
                }
            });
        }

        const second = validateText(repairedOutput, schemaOrName);
        return Object.assign({}, second, {
            repaired: second.ok,
            repairAttempted: true,
            originalRawText: rawText,
            originalErrors: first.errors,
            repairError: second.ok ? null : {
                message: summarizeErrors(second.errors),
                code: 'repair_invalid'
            }
        });
    }

    function getSchemaPayload(schemaOrName) {
        const schema = resolveSchema(schemaOrName);
        if (!schema) return null;
        return schema;
    }

    function supportsNativeSchema(capabilities) {
        const support = capabilities && capabilities.structuredOutput;
        return support === true || support === 'model-dependent' || support === 'tool-or-schema';
    }

    function prepareRequest(request, capabilities) {
        if (!request || !request.responseSchema) return request;
        const nativeStructuredOutput = supportsNativeSchema(capabilities);
        const schema = getSchemaPayload(request.responseSchema);
        const metadata = Object.assign({}, request.metadata || {}, {
            structuredOutputMode: nativeStructuredOutput ? 'native' : 'promptOnly'
        });
        const prepared = Object.assign({}, request, { metadata });

        if (nativeStructuredOutput) return prepared;

        const instruction = [
            'Return only valid JSON that matches the requested schema.',
            'Do not include markdown fences, comments, or explanatory text.',
            `Schema: ${JSON.stringify(schema || request.responseSchema)}`
        ].join('\n');
        prepared.messages = [{ role: 'system', content: instruction }].concat(request.messages || []);
        return prepared;
    }

    function structuredErrorFromResult(result) {
        const isParseError = Boolean(result.parseError);
        const repairFailed = result.repairAttempted && result.repairError;
        const message = repairFailed
            ? tr('alerts.structuredRepairFailed', { error: result.repairError.message }, `AI returned invalid structured output, and repair did not produce valid JSON: ${result.repairError.message}`)
            : isParseError
            ? tr('alerts.structuredInvalidJson', { error: result.parseError.message }, `AI returned invalid JSON: ${result.parseError.message}`)
            : tr('alerts.structuredSchemaInvalid', { errors: summarizeErrors(result.validationErrors) }, `AI returned JSON that does not match the expected schema: ${summarizeErrors(result.validationErrors)}`);
        return makeError(repairFailed ? 'structured_repair_failed' : (isParseError ? 'structured_invalid_json' : 'structured_schema_invalid'), message, {
            rawOutput: result.rawText,
            validationErrors: result.validationErrors,
            parseError: result.parseError,
            schemaLabel: result.schemaLabel,
            repairAttempted: result.repairAttempted,
            repairError: result.repairError
        });
    }

    window.AIStructuredOutput = {
        schemas: {
            plotPlan: PLOT_PLAN_SCHEMA,
            beatTemplateV2: BEAT_TEMPLATE_V2_SCHEMA
        },
        registry: SCHEMA_REGISTRY,
        parseJsonSafely,
        extractJsonCandidate,
        resolveSchema,
        schemaLabel,
        validateJson,
        validateText,
        summarizeErrors,
        buildRepairPrompt,
        processWithRepair,
        prepareRequest,
        supportsNativeSchema,
        structuredErrorFromResult,
        _test: {
            validateNode,
            matchesType,
            resolveRef,
            stripCodeFence
        }
    };
})();
