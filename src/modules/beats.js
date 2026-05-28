// Structural story Beats, separate from generation Briefs.
(function () {
    const TEMPLATE_FORMAT = 'writingway2.beat-template';
    const TEMPLATE_VERSION = 2;
    const TemplateService = window.BeatTemplateService;
    const MEDIUMS = new Set(['novel', 'screenplay', 'shortStory', 'manga', 'game', 'general']);

    function id(prefix) {
        return Date.now().toString() + '-' + prefix + '-' + Math.random().toString(36).slice(2, 8);
    }

    function nowPatch() {
        const now = new Date();
        return { modified: now, updatedAt: Date.now() };
    }

    function normalizeTemplate(template) {
        return TemplateService.normalizeTemplate(template);
    }

    function normalizeSlot(slot, index, usedIds) {
        return TemplateService.normalizeSlot(slot, index, usedIds);
    }

    function sortSlots(slots) {
        return (slots || []).slice().sort((a, b) => {
            const orderA = Number.isFinite(a.order) ? a.order : 0;
            const orderB = Number.isFinite(b.order) ? b.order : 0;
            return orderA - orderB;
        });
    }

    function asString(value) {
        return value == null ? '' : String(value);
    }

    function truncate(value, max = 240) {
        const text = asString(value);
        return text.length > max ? `${text.slice(0, max)}...` : text;
    }

    function tr(app, key, params, fallback) {
        if (app && typeof app.t === 'function') return app.t(key, params, fallback);
        return window.t ? window.t(key, params, fallback) : (fallback || key);
    }

    function slotForPrompt(slot, index) {
        return {
            id: asString(slot.id || `slot-${index + 1}`),
            title: asString(slot.title || `Slot ${index + 1}`),
            order: Number.isFinite(slot.order) ? slot.order : index,
            description: asString(slot.description || ''),
            purpose: asString(slot.purpose || ''),
            recommendedPosition: slot.recommendedPosition || null,
            promptHint: asString(slot.promptHint || ''),
            requiredInputs: Array.isArray(slot.requiredInputs) ? slot.requiredInputs.map(asString).filter(Boolean) : [],
            examples: Array.isArray(slot.examples) ? slot.examples.map(asString).filter(Boolean) : []
        };
    }

    function templateForPrompt(template) {
        const normalized = normalizeTemplate(template);
        return {
            id: asString(normalized.id),
            name: asString(normalized.name),
            description: asString(normalized.description || ''),
            medium: MEDIUMS.has(normalized.medium) ? normalized.medium : 'general',
            tags: Array.isArray(normalized.tags) ? normalized.tags.map(asString).filter(Boolean) : [],
            slots: sortSlots(normalized.slots || []).map(slotForPrompt)
        };
    }

    function preferenceSummaryForTask(app, task) {
        const summary = app && app.preferenceRequestSummary;
        if (!summary || (summary.task && summary.task !== task)) return null;
        if (!summary.text && (!summary.explicit || Object.keys(summary.explicit).length === 0) && !summary.learned) return null;
        return {
            explicit: summary.explicit || {},
            learned: summary.learned || {},
            text: summary.text || ''
        };
    }

    function needsNormalization(template) {
        if (!template || template.version !== 2 || !Array.isArray(template.slots)) return true;
        return template.slots.some(slot => (
            !slot ||
            typeof slot !== 'object' ||
            !slot.id ||
            !slot.title ||
            !Number.isFinite(slot.order) ||
            typeof slot.description !== 'string' ||
            typeof slot.purpose !== 'string'
        ));
    }

    function makeTemplateEnvelope(template) {
        return {
            format: TEMPLATE_FORMAT,
            version: TEMPLATE_VERSION,
            exportedAt: new Date().toISOString(),
            template: normalizeTemplate(template)
        };
    }

    function parseTemplateEnvelope(parsed, options) {
        if (!parsed || parsed.format !== TEMPLATE_FORMAT || !parsed.template || !Array.isArray(parsed.template.slots)) {
            throw new Error('Invalid beat template file.');
        }
        if (parsed.version !== 1 && parsed.version !== 2) {
            throw new Error('Unsupported beat template version.');
        }
        const newTemplateId = options && options.newId ? options.newId : id('template');
        return normalizeTemplate({
            ...parsed.template,
            id: newTemplateId,
            builtIn: false,
            source: 'imported',
            created: new Date(),
            modified: new Date(),
            updatedAt: Date.now()
        });
    }

    async function ensureTemplates() {
        if (!db.beatTemplates) return;
        const now = new Date();
        for (const preset of TemplateService.builtInTemplates()) {
            const existing = await db.beatTemplates.get(preset.id);
            if (!existing) {
                await db.beatTemplates.put({ ...preset, created: now, modified: now, updatedAt: Date.now() });
            } else if (existing.builtIn === true && needsNormalization(existing)) {
                await db.beatTemplates.put({
                    ...preset,
                    created: existing.created || now,
                    modified: now,
                    updatedAt: Date.now()
                });
            }
        }

        const templates = await db.beatTemplates.toArray();
        for (const template of templates) {
            if (!needsNormalization(template)) continue;
            await db.beatTemplates.put({
                ...normalizeTemplate(template),
                created: template.created || now,
                modified: template.modified || now,
                updatedAt: template.updatedAt || Date.now()
            });
        }
    }

    async function loadTemplates(app) {
        await ensureTemplates();
        app.beatTemplates = db.beatTemplates ? (await db.beatTemplates.toArray()).map(normalizeTemplate) : [];
    }

    async function loadBeats(app) {
        if (!app.currentProject || !db.beats) {
            app.beats = [];
            return;
        }
        let beats = await db.beats.where('projectId').equals(app.currentProject.id).sortBy('order');
        if (app.beatScopeFilter && app.beatScopeFilter !== 'all') {
            beats = beats.filter(beat => beat.scope === app.beatScopeFilter);
        }
        app.beats = beats;
    }

    async function open(app) {
        app.showBeatsPanel = true;
        await loadTemplates(app);
        await loadBeats(app);
    }

    function close(app) {
        app.showBeatsPanel = false;
    }

    async function createBeat(app) {
        if (!app.currentProject || !app.newBeatTitle.trim()) return;
        const scope = app.newBeatScope || 'project';
        const beat = {
            id: id('beat'),
            projectId: app.currentProject.id,
            chapterId: scope === 'chapter' ? (app.newBeatChapterId || '') : '',
            sceneId: scope === 'scene' ? (app.newBeatSceneId || '') : '',
            scope,
            title: app.newBeatTitle.trim(),
            body: app.newBeatBody || '',
            order: await db.beats.where('projectId').equals(app.currentProject.id).count(),
            status: app.newBeatStatus || 'planned',
            templateId: '',
            templateSlotId: '',
            tags: [],
            created: new Date(),
            modified: new Date()
        };
        await db.beats.add(beat);
        app.newBeatTitle = '';
        app.newBeatBody = '';
        await loadBeats(app);
    }

    async function updateBeatStatus(app, beatId, status) {
        await db.beats.update(beatId, { status, ...nowPatch() });
        await loadBeats(app);
    }

    async function linkBeatToScene(app, beatId, sceneId) {
        const scene = sceneId ? await db.scenes.get(sceneId) : null;
        await db.beats.update(beatId, {
            sceneId: sceneId || '',
            chapterId: scene ? scene.chapterId : '',
            scope: sceneId ? 'scene' : 'project',
            ...nowPatch()
        });
        await loadBeats(app);
    }

    async function moveBeat(app, beatId, direction) {
        const all = await db.beats.where('projectId').equals(app.currentProject.id).sortBy('order');
        const index = all.findIndex(beat => beat.id === beatId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= all.length) return;
        const current = all[index];
        const other = all[target];
        await db.beats.update(current.id, { order: other.order, ...nowPatch() });
        await db.beats.update(other.id, { order: current.order, ...nowPatch() });
        await loadBeats(app);
    }

    async function deleteBeat(app, beatId) {
        await db.beats.delete(beatId);
        await loadBeats(app);
    }

    async function createBeatsFromTemplate(app) {
        if (!app.currentProject || !app.selectedBeatTemplateId) return;
        const template = normalizeTemplate(await db.beatTemplates.get(app.selectedBeatTemplateId));
        if (!template || !Array.isArray(template.slots) || template.slots.length === 0) return;
        const slots = sortSlots(template.slots);
        const start = await db.beats.where('projectId').equals(app.currentProject.id).count();
        const rows = slots.map((slot, index) => ({
            id: id('beat'),
            projectId: app.currentProject.id,
            chapterId: '',
            sceneId: '',
            scope: 'project',
            title: slot.title,
            body: slot.promptHint || slot.description || '',
            order: start + index,
            status: 'planned',
            templateId: template.id,
            templateSlotId: slot.id,
            templateSlotTitle: slot.title,
            templateSlotOrder: slot.order,
            tags: Array.isArray(template.tags) ? template.tags.slice() : [],
            created: new Date(),
            modified: new Date()
        }));
        await db.beats.bulkAdd(rows);
        await loadBeats(app);
    }

    async function createTemplate(app) {
        const slots = String(app.newBeatTemplateSlots || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!app.newBeatTemplateName.trim() || slots.length === 0) return;
        const template = normalizeTemplate({
            id: id('template'),
            name: app.newBeatTemplateName.trim(),
            builtIn: false,
            source: 'custom',
            medium: 'general',
            tags: [],
            slots,
            created: new Date(),
            modified: new Date(),
            updatedAt: Date.now()
        });
        await db.beatTemplates.add(template);
        app.newBeatTemplateName = '';
        app.newBeatTemplateSlots = '';
        await loadTemplates(app);
    }

    async function exportTemplate(app) {
        const template = app.selectedBeatTemplateId ? await db.beatTemplates.get(app.selectedBeatTemplateId) : null;
        if (!template) return;
        const envelope = makeTemplateEnvelope(template);
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${envelope.template.name.replace(/[^a-z0-9_-]+/gi, '_')}_beat_template.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function importTemplate(app, event) {
        const file = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;
        const parsed = JSON.parse(await file.text());
        const template = parseTemplateEnvelope(parsed);
        await db.beatTemplates.put(template);
        await loadTemplates(app);
        return template;
    }

    async function getTemplateById(templateId) {
        if (!templateId || !db.beatTemplates) return null;
        const row = await db.beatTemplates.get(templateId);
        return row ? normalizeTemplate(row) : null;
    }

    async function openTemplateCustomization(app) {
        await loadTemplates(app);
        const templateId = app.selectedBeatTemplateId || app.templateCustomizationBaseId || '';
        if (!templateId) return null;
        const template = await getTemplateById(templateId);
        if (!template) return null;
        app.templateCustomizationBaseId = template.id;
        app.templateCustomizationInstruction = '';
        app.templateCustomizationIsGenerating = false;
        app.templateCustomizationError = '';
        app.templateCustomizationDraft = null;
        app.templateCustomizationChangeSummary = [];
        app.templateCustomizationAiRunId = '';
        app.showTemplateCustomizationModal = true;
        return template;
    }

    function closeTemplateCustomization(app) {
        app.showTemplateCustomizationModal = false;
    }

    function buildTemplateCustomizationMessages(app, baseTemplate) {
        const templatePayload = templateForPrompt(baseTemplate);
        const instruction = asString(app.templateCustomizationInstruction).trim();
        const preferenceSummary = preferenceSummaryForTask(app, 'template.customize');
        const outputRules = {
            format: TEMPLATE_FORMAT,
            version: TEMPLATE_VERSION,
            template: {
                version: TEMPLATE_VERSION,
                source: 'aiCustomized',
                builtIn: false,
                baseTemplateId: templatePayload.id,
                customization: {
                    instruction: 'Summarize or restate the user customization instruction.',
                    changeSummary: ['Short human-readable change summary item.']
                },
                slots: [{
                    id: 'stable-slot-id',
                    title: 'Slot title',
                    order: 0,
                    description: 'What this slot represents.',
                    purpose: 'Why this beat exists.'
                }]
            }
        };
        const userContent = [
            'Customize this normalized beat template according to the user instruction.',
            '',
            'Required output shape:',
            JSON.stringify(outputRules, null, 2),
            '',
            'The output must include template.customization.changeSummary as short review bullets.',
            'The customized template must be reusable and must not depend on the original template being changed.',
            '',
            `Base template JSON:\n${JSON.stringify(templatePayload, null, 2)}`,
            '',
            `User customization instruction:\n${instruction}`
        ];
        if (preferenceSummary) {
            userContent.push('', `Local preference summary JSON:\n${JSON.stringify(preferenceSummary, null, 2)}`);
        }
        return [
            {
                role: 'system',
                content: [
                    'You are a story-structure template designer for Writingway.',
                    'Return a structured JSON beat-template export envelope only.',
                    'Preserve stable slot IDs when a slot keeps the same structural role.',
                    'Use concise descriptions, purposes, and prompt hints for each slot.',
                    'Do not write prose scenes. Do not include markdown.'
                ].join('\n')
            },
            {
                role: 'user',
                content: userContent.join('\n')
            }
        ];
    }

    function buildTemplateCustomizationRequest(app, baseTemplate, settingsInput) {
        if (!window.AIContracts || !window.AIStructuredOutput) {
            throw new Error(tr(app, 'alerts.aiGatewayContractsMissing', null, 'AI Gateway contracts are not loaded'));
        }
        const settings = window.AIContracts.normalizeSettings(settingsInput || window.AIContracts.settingsFromApp(app));
        const templatePayload = templateForPrompt(baseTemplate);
        return window.AIContracts.createRequest({
            task: 'template.customize',
            messages: buildTemplateCustomizationMessages(app, baseTemplate),
            context: {
                projectId: asString(app.currentProject?.id || ''),
                templateId: templatePayload.id
            },
            responseSchema: window.AIStructuredOutput.schemas.beatTemplateV2,
            stream: false,
            modelProfile: {
                provider: settings.provider,
                model: settings.model
            },
            generation: {
                temperature: typeof app.temperature === 'number' ? app.temperature : settings.temperature,
                maxOutputTokens: Math.max(Number(settings.maxTokens || app.maxTokens || 0), 1600)
            },
            metadata: {
                source: 'beat-template-customization-modal',
                saveRun: true,
                baseTemplateId: templatePayload.id,
                baseSlotCount: templatePayload.slots.length,
                instructionChars: asString(app.templateCustomizationInstruction).trim().length,
                preferenceSummaryChars: asString(preferenceSummaryForTask(app, 'template.customize')?.text || '').length,
                tuningEventCount: preferenceSummaryForTask(app, 'template.customize')?.learned?.recentEvents?.length || 0
            }
        });
    }

    function summarizeCustomizationRequest(app, baseTemplate, request) {
        const templatePayload = templateForPrompt(baseTemplate);
        return {
            hasSchema: Boolean(request.responseSchema),
            contextKinds: ['template', 'customization-instruction'],
            baseTemplateId: templatePayload.id,
            baseSlotCount: templatePayload.slots.length,
            instructionChars: asString(app.templateCustomizationInstruction).trim().length,
            medium: templatePayload.medium || 'general',
            preferenceSummaryChars: asString(preferenceSummaryForTask(app, 'template.customize')?.text || '').length,
            tuningEventCount: preferenceSummaryForTask(app, 'template.customize')?.learned?.recentEvents?.length || 0
        };
    }

    function normalizeAiRun(row, options = {}) {
        const input = row && typeof row === 'object' ? row : {};
        return {
            ...input,
            id: asString(input.id || options.id || id('airun')),
            projectId: asString(input.projectId || options.projectId || ''),
            sceneId: asString(input.sceneId || ''),
            templateId: asString(input.templateId || ''),
            plotPlanId: asString(input.plotPlanId || ''),
            task: asString(input.task || ''),
            provider: asString(input.provider || ''),
            model: asString(input.model || ''),
            status: asString(input.status || 'unknown'),
            requestSummary: input.requestSummary && typeof input.requestSummary === 'object' ? input.requestSummary : {},
            responseSummary: input.responseSummary && typeof input.responseSummary === 'object' ? input.responseSummary : {},
            usage: input.usage && typeof input.usage === 'object' ? input.usage : {},
            created: input.created || new Date(),
            updatedAt: input.updatedAt || Date.now()
        };
    }

    async function createTemplateCustomizationAiRun(app, baseTemplate, request, settings) {
        const row = normalizeAiRun({
            id: id('airun'),
            projectId: app.currentProject?.id || '',
            templateId: baseTemplate.id || app.templateCustomizationBaseId || '',
            plotPlanId: '',
            task: 'template.customize',
            provider: settings.provider || '',
            model: settings.model || '',
            status: 'running',
            requestSummary: summarizeCustomizationRequest(app, baseTemplate, request),
            responseSummary: {},
            usage: {},
            created: new Date(),
            updatedAt: Date.now()
        });
        if (db.aiRuns) await db.aiRuns.put(row);
        app.templateCustomizationAiRunId = row.id;
        return row;
    }

    async function updateTemplateCustomizationAiRun(aiRunId, patch) {
        if (!aiRunId || !db.aiRuns) return;
        await db.aiRuns.update(aiRunId, {
            ...patch,
            updatedAt: Date.now()
        });
    }

    function validateTemplateEnvelope(envelope) {
        if (!window.AIStructuredOutput) {
            throw new Error(tr(null, 'alerts.structuredSupportMissing', null, 'Structured output support is not loaded'));
        }
        const validation = window.AIStructuredOutput.validateJson(envelope, window.AIStructuredOutput.schemas.beatTemplateV2);
        if (!validation.ok) {
            throw window.AIStructuredOutput.structuredErrorFromResult({
                rawText: JSON.stringify(envelope),
                parseError: null,
                validationErrors: validation.errors,
                errors: validation.errors,
                schemaLabel: validation.schemaLabel,
                repairAttempted: false,
                repairError: null
            });
        }
        return validation;
    }

    function changeSummaryFromTemplate(baseTemplate, customizedTemplate) {
        const base = templateForPrompt(baseTemplate);
        const customized = templateForPrompt(customizedTemplate);
        const summary = [];
        if (base.name !== customized.name) {
            summary.push(`Renamed "${base.name}" to "${customized.name}".`);
        }
        if (base.slots.length !== customized.slots.length) {
            summary.push(`Changed slot count from ${base.slots.length} to ${customized.slots.length}.`);
        }
        const baseIds = new Set(base.slots.map(slot => slot.id));
        const newSlots = customized.slots.filter(slot => !baseIds.has(slot.id));
        if (newSlots.length > 0) {
            summary.push(`Added ${newSlots.length} new slot(s): ${newSlots.map(slot => slot.title).join(', ')}.`);
        }
        if (summary.length === 0) {
            summary.push(`Customized ${customized.slots.length} slot(s) from ${base.name}.`);
        }
        return summary;
    }

    function normalizeGeneratedTemplate(outputJson, app, baseTemplate, aiRunId) {
        const envelope = outputJson && typeof outputJson === 'object' ? outputJson : {};
        validateTemplateEnvelope(envelope);
        const rawTemplate = envelope.template || {};
        const rawCustomization = rawTemplate.customization && typeof rawTemplate.customization === 'object'
            ? rawTemplate.customization
            : {};
        const rawSummary = Array.isArray(rawCustomization.changeSummary)
            ? rawCustomization.changeSummary.map(asString).map(item => item.trim()).filter(Boolean)
            : [];
        const now = new Date();
        let customized = normalizeTemplate({
            ...rawTemplate,
            id: id('template'),
            builtIn: false,
            source: 'aiCustomized',
            baseTemplateId: baseTemplate.id || app.templateCustomizationBaseId || '',
            customization: {
                ...rawCustomization,
                instruction: asString(app.templateCustomizationInstruction).trim(),
                changeSummary: rawSummary,
                aiRunId
            },
            created: now,
            modified: now,
            updatedAt: Date.now()
        });
        const changeSummary = rawSummary.length > 0 ? rawSummary : changeSummaryFromTemplate(baseTemplate, customized);
        customized = normalizeTemplate({
            ...customized,
            customization: {
                ...(customized.customization || {}),
                instruction: asString(app.templateCustomizationInstruction).trim(),
                changeSummary,
                aiRunId
            }
        });
        validateTemplateEnvelope(makeTemplateEnvelope(customized));
        return { template: customized, changeSummary };
    }

    async function generateTemplateCustomization(app, options = {}) {
        if (!app.selectedBeatTemplateId && !app.templateCustomizationBaseId) {
            throw new Error(tr(app, 'alerts.templateCustomizationTemplateRequired', null, 'Choose a template first.'));
        }
        if (!asString(app.templateCustomizationInstruction).trim()) {
            throw new Error(tr(app, 'alerts.templateCustomizationInstructionRequired', null, 'Enter customization instructions first.'));
        }
        if (!window.AIOrchestrator || !window.AIContracts || !window.AIStructuredOutput) {
            throw new Error(tr(app, 'alerts.aiGatewayContractsMissing', null, 'AI Gateway contracts are not loaded'));
        }

        app.templateCustomizationIsGenerating = true;
        app.templateCustomizationError = '';
        app.templateCustomizationDraft = null;
        app.templateCustomizationChangeSummary = [];

        let aiRun = null;
        try {
            const baseTemplate = await getTemplateById(app.templateCustomizationBaseId || app.selectedBeatTemplateId);
            if (!baseTemplate || !Array.isArray(baseTemplate.slots) || baseTemplate.slots.length === 0) {
                throw new Error(tr(app, 'alerts.templateCustomizationTemplateRequired', null, 'Choose a template first.'));
            }
            app.templateCustomizationBaseId = baseTemplate.id;
            const settings = window.AIContracts.normalizeSettings(options.settings || window.AIContracts.settingsFromApp(app));
            if (window.Preferences && typeof window.Preferences.prepareRequestContext === 'function') {
                await window.Preferences.prepareRequestContext(app, 'template.customize');
            }
            const request = buildTemplateCustomizationRequest(app, baseTemplate, settings);
            aiRun = await createTemplateCustomizationAiRun(app, baseTemplate, request, settings);
            const result = await window.AIOrchestrator.run(request, settings, options.callbacks || {});
            let outputJson = result && result.outputJson;

            if (!outputJson) {
                const parsed = window.AIStructuredOutput.validateText(result?.outputText || '', window.AIStructuredOutput.schemas.beatTemplateV2);
                if (!parsed.ok) throw window.AIStructuredOutput.structuredErrorFromResult(parsed);
                outputJson = parsed.outputJson;
            } else {
                validateTemplateEnvelope(outputJson);
            }

            const normalized = normalizeGeneratedTemplate(outputJson, app, baseTemplate, aiRun.id);
            app.templateCustomizationDraft = normalized.template;
            app.templateCustomizationChangeSummary = normalized.changeSummary;

            await updateTemplateCustomizationAiRun(aiRun.id, {
                status: 'succeeded',
                responseSummary: {
                    structured: true,
                    slotCount: normalized.template.slots.length,
                    changeCount: normalized.changeSummary.length,
                    outputChars: asString(result?.outputText || JSON.stringify(outputJson)).length,
                    validationErrors: [],
                    repaired: Boolean(result?.repaired)
                },
                usage: result?.usage || {}
            });
            return normalized.template;
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            app.templateCustomizationError = message;
            if (aiRun) {
                await updateTemplateCustomizationAiRun(aiRun.id, {
                    status: 'failed',
                    responseSummary: {
                        structured: true,
                        errorCode: truncate(error?.code || 'template_customization_failed', 120),
                        errorMessage: truncate(message, 400),
                        validationErrors: Array.isArray(error?.validationErrors)
                            ? error.validationErrors.map(validationError => ({
                                path: validationError.path || '$',
                                message: truncate(validationError.message || validationError.code || 'invalid', 240),
                                code: validationError.code || 'schema_invalid'
                            }))
                            : []
                    },
                    usage: {}
                });
            }
            throw error;
        } finally {
            app.templateCustomizationIsGenerating = false;
        }
    }

    async function saveCustomizedTemplate(app) {
        if (!db.beatTemplates) throw new Error('beatTemplates table is unavailable.');
        if (!app.templateCustomizationDraft) {
            throw new Error(tr(app, 'alerts.templateCustomizationNoDraft', null, 'Generate a customized template before saving.'));
        }
        const draft = app.templateCustomizationDraft;
        const baseTemplateId = draft.baseTemplateId || app.templateCustomizationBaseId || app.selectedBeatTemplateId || '';
        const templateId = draft.id && draft.id !== baseTemplateId ? draft.id : id('template');
        const customized = normalizeTemplate({
            ...draft,
            id: templateId,
            builtIn: false,
            source: 'aiCustomized',
            baseTemplateId,
            customization: {
                ...(draft.customization || {}),
                instruction: asString(app.templateCustomizationInstruction || draft.customization?.instruction || '').trim(),
                changeSummary: Array.isArray(app.templateCustomizationChangeSummary)
                    ? app.templateCustomizationChangeSummary.map(asString).filter(Boolean)
                    : [],
                aiRunId: app.templateCustomizationAiRunId || draft.customization?.aiRunId || ''
            },
            created: draft.created || new Date(),
            modified: new Date(),
            updatedAt: Date.now()
        });
        validateTemplateEnvelope(makeTemplateEnvelope(customized));
        await db.beatTemplates.put(customized);
        await updateTemplateCustomizationAiRun(customized.customization.aiRunId, {
            responseSummary: {
                savedTemplateId: customized.id,
                slotCount: customized.slots.length,
                changeCount: customized.customization.changeSummary.length
            }
        });
        app.templateCustomizationDraft = customized;
        app.selectedBeatTemplateId = customized.id;
        app.showTemplateCustomizationModal = false;
        if (window.Preferences && typeof window.Preferences.trackTemplateDecision === 'function') {
            await window.Preferences.trackTemplateDecision(app, customized, 'accepted');
        }
        await loadTemplates(app);
        return customized;
    }

    async function rejectTemplateCustomization(app) {
        const draft = app.templateCustomizationDraft;
        if (draft && window.Preferences && typeof window.Preferences.trackTemplateDecision === 'function') {
            await window.Preferences.trackTemplateDecision(app, draft, 'rejected');
        }
        app.templateCustomizationDraft = null;
        app.templateCustomizationChangeSummary = [];
        app.templateCustomizationError = '';
        app.showTemplateCustomizationModal = false;
        return draft || null;
    }

    async function getBeatReferencesForScene(sceneId) {
        if (!sceneId || !db.beats) return [];
        return db.beats.where('sceneId').equals(sceneId).toArray();
    }

    window.Beats = {
        open,
        close,
        loadBeats,
        loadTemplates,
        createBeat,
        updateBeatStatus,
        linkBeatToScene,
        moveBeat,
        deleteBeat,
        createBeatsFromTemplate,
        createTemplate,
        exportTemplate,
        importTemplate,
        openTemplateCustomization,
        closeTemplateCustomization,
        generateTemplateCustomization,
        saveCustomizedTemplate,
        rejectTemplateCustomization,
        getBeatReferencesForScene,
        _test: {
            TEMPLATE_FORMAT,
            TEMPLATE_VERSION,
            normalizeSlot,
            normalizeTemplate,
            slugifySlotId: TemplateService.slugifySlotId,
            makeTemplateEnvelope,
            parseTemplateEnvelope,
            sortSlots,
            templateForPrompt,
            buildTemplateCustomizationMessages,
            buildTemplateCustomizationRequest,
            summarizeCustomizationRequest,
            normalizeGeneratedTemplate,
            normalizeAiRun,
            preferenceSummaryForTask
        }
    };
})();
