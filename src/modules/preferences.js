// Local preference tuning. This is prompt/context adaptation only, not provider fine-tuning.
(function () {
    const PREF_KEYS = {
        plotBeatDensity: 'plot.beatDensity',
        plotInstructions: 'plot.instructions',
        templateSlotGranularity: 'template.slotGranularity',
        templateInstructions: 'template.instructions',
        styleDefaultTone: 'style.defaultTone'
    };
    const BEAT_DENSITIES = new Set(['concise', 'balanced', 'detailed']);
    const TEMPLATE_GRANULARITIES = new Set(['compact', 'balanced', 'expanded']);
    const DECISIONS = new Set(['accepted', 'rejected']);

    function id(prefix) {
        return Date.now().toString() + '-' + prefix + '-' + Math.random().toString(36).slice(2, 8);
    }

    function asString(value) {
        return value == null ? '' : String(value);
    }

    function truncate(value, max = 240) {
        const text = asString(value).trim();
        return text.length > max ? `${text.slice(0, max)}...` : text;
    }

    function projectIdFrom(appOrProjectId) {
        if (typeof appOrProjectId === 'string') return appOrProjectId;
        return appOrProjectId?.currentProject?.id || appOrProjectId?.projectId || '';
    }

    function prefId(projectId, key) {
        return `${projectId || 'global'}::${key}`;
    }

    function normalizePreference(row, options = {}) {
        const input = row && typeof row === 'object' ? row : {};
        const projectId = asString(input.projectId || options.projectId || '');
        const key = asString(input.key || options.key || '');
        const now = Date.now();
        return {
            ...input,
            id: asString(input.id || options.id || prefId(projectId, key)),
            scope: asString(input.scope || options.scope || (projectId ? 'project' : 'global')),
            projectId,
            key,
            value: asString(input.value ?? options.value ?? ''),
            source: asString(input.source || options.source || 'explicit'),
            created: input.created || options.created || new Date(),
            updatedAt: Number(input.updatedAt || options.updatedAt || now)
        };
    }

    function normalizeTuningEvent(row, options = {}) {
        const input = row && typeof row === 'object' ? row : {};
        const decision = DECISIONS.has(input.decision) ? input.decision : (DECISIONS.has(options.decision) ? options.decision : 'accepted');
        const created = input.created || options.created || new Date();
        return {
            ...input,
            id: asString(input.id || options.id || id('tune')),
            projectId: asString(input.projectId || options.projectId || ''),
            task: asString(input.task || options.task || ''),
            source: asString(input.source || options.source || ''),
            decision,
            targetType: asString(input.targetType || options.targetType || ''),
            targetId: asString(input.targetId || options.targetId || ''),
            templateId: asString(input.templateId || options.templateId || ''),
            plotPlanId: asString(input.plotPlanId || options.plotPlanId || ''),
            aiRunId: asString(input.aiRunId || options.aiRunId || ''),
            summary: input.summary && typeof input.summary === 'object' ? input.summary : (options.summary || {}),
            inference: input.inference && typeof input.inference === 'object' ? input.inference : (options.inference || {}),
            created,
            updatedAt: Number(input.updatedAt || options.updatedAt || Date.now())
        };
    }

    async function preferencesForProject(projectId) {
        if (!db.userPreferences || !projectId) return [];
        const rows = await db.userPreferences.where('projectId').equals(projectId).toArray();
        rows.sort((a, b) => String(a.key || '').localeCompare(String(b.key || '')));
        return rows.map(normalizePreference);
    }

    async function eventsForProject(projectId, limit = 12) {
        if (!db.tuningEvents || !projectId) return [];
        const rows = await db.tuningEvents.where('projectId').equals(projectId).toArray();
        rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
        return rows.slice(0, limit).map(normalizeTuningEvent);
    }

    function rowsToMap(rows) {
        const map = {};
        (rows || []).forEach(row => {
            if (row.key) map[row.key] = asString(row.value);
        });
        return map;
    }

    function explicitForTask(preferences, task) {
        const map = rowsToMap(preferences);
        const explicit = {};
        if (task === 'plot.generate' || !task) {
            if (map[PREF_KEYS.plotBeatDensity]) explicit.beatDensity = map[PREF_KEYS.plotBeatDensity];
            if (map[PREF_KEYS.plotInstructions]) explicit.plotInstructions = map[PREF_KEYS.plotInstructions];
        }
        if (task === 'template.customize' || !task) {
            if (map[PREF_KEYS.templateSlotGranularity]) explicit.slotGranularity = map[PREF_KEYS.templateSlotGranularity];
            if (map[PREF_KEYS.templateInstructions]) explicit.templateInstructions = map[PREF_KEYS.templateInstructions];
        }
        if (map[PREF_KEYS.styleDefaultTone]) explicit.defaultTone = map[PREF_KEYS.styleDefaultTone];
        return explicit;
    }

    function countEvents(events) {
        const counts = {
            acceptedPlotPlans: 0,
            rejectedPlotPlans: 0,
            acceptedTemplates: 0,
            rejectedTemplates: 0
        };
        (events || []).forEach(event => {
            if (event.targetType === 'plotPlan' && event.decision === 'accepted') counts.acceptedPlotPlans += 1;
            if (event.targetType === 'plotPlan' && event.decision === 'rejected') counts.rejectedPlotPlans += 1;
            if (event.targetType === 'beatTemplate' && event.decision === 'accepted') counts.acceptedTemplates += 1;
            if (event.targetType === 'beatTemplate' && event.decision === 'rejected') counts.rejectedTemplates += 1;
        });
        return counts;
    }

    function eventForSummary(event) {
        const summary = event.summary || {};
        return {
            task: event.task,
            decision: event.decision,
            targetType: event.targetType,
            title: truncate(summary.title || summary.name || event.targetId, 80),
            templateId: event.templateId || summary.templateId || '',
            itemCount: summary.beatCount || summary.slotCount || summary.selectedCount || 0,
            medium: summary.medium || '',
            genre: summary.genre || '',
            tone: summary.tone || ''
        };
    }

    function summaryText(summary) {
        const lines = [];
        const explicit = summary.explicit || {};
        if (explicit.beatDensity) lines.push(`Plot beat density: ${explicit.beatDensity}`);
        if (explicit.slotGranularity) lines.push(`Template slot granularity: ${explicit.slotGranularity}`);
        if (explicit.defaultTone) lines.push(`Default tone: ${explicit.defaultTone}`);
        if (explicit.plotInstructions) lines.push(`Plot guidance: ${truncate(explicit.plotInstructions, 180)}`);
        if (explicit.templateInstructions) lines.push(`Template guidance: ${truncate(explicit.templateInstructions, 180)}`);
        const counts = summary.learned?.counts || {};
        const countLine = [
            counts.acceptedPlotPlans ? `${counts.acceptedPlotPlans} accepted plot plan(s)` : '',
            counts.rejectedPlotPlans ? `${counts.rejectedPlotPlans} rejected plot plan(s)` : '',
            counts.acceptedTemplates ? `${counts.acceptedTemplates} accepted template(s)` : '',
            counts.rejectedTemplates ? `${counts.rejectedTemplates} rejected template(s)` : ''
        ].filter(Boolean).join(', ');
        if (countLine) lines.push(`Review history: ${countLine}`);
        return lines.join('\n');
    }

    async function buildPreferenceSummary(appOrProjectId, task = '') {
        const projectId = projectIdFrom(appOrProjectId);
        const preferences = await preferencesForProject(projectId);
        const events = await eventsForProject(projectId, 12);
        const relevantEvents = task ? events.filter(event => event.task === task).concat(events.filter(event => event.task !== task)).slice(0, 8) : events.slice(0, 8);
        const summary = {
            projectId,
            task,
            explicit: explicitForTask(preferences, task),
            learned: {
                counts: countEvents(events),
                recentEvents: relevantEvents.map(eventForSummary)
            },
            updatedAt: Date.now()
        };
        summary.text = summaryText(summary);
        return summary;
    }

    async function prepareRequestContext(app, task) {
        const summary = await buildPreferenceSummary(app, task);
        app.preferenceRequestSummary = summary;
        app.preferenceSummaryText = summary.text;
        return summary;
    }

    function writeStateFromRows(app, preferences, events, summary) {
        const map = rowsToMap(preferences);
        app.preferenceRows = preferences;
        app.tuningEvents = events;
        app.preferenceBeatDensity = BEAT_DENSITIES.has(map[PREF_KEYS.plotBeatDensity]) ? map[PREF_KEYS.plotBeatDensity] : 'balanced';
        app.preferencePlotGuidance = map[PREF_KEYS.plotInstructions] || '';
        app.preferenceTemplateDetail = TEMPLATE_GRANULARITIES.has(map[PREF_KEYS.templateSlotGranularity]) ? map[PREF_KEYS.templateSlotGranularity] : 'balanced';
        app.preferenceTemplateGuidance = map[PREF_KEYS.templateInstructions] || '';
        app.preferenceDefaultTone = map[PREF_KEYS.styleDefaultTone] || '';
        app.preferenceSummaryText = summary ? summary.text : '';
    }

    async function load(app) {
        const projectId = projectIdFrom(app);
        if (!projectId) {
            writeStateFromRows(app, [], [], { text: '' });
            return { preferences: [], events: [], summary: { text: '' } };
        }
        const preferences = await preferencesForProject(projectId);
        const events = await eventsForProject(projectId, 12);
        const summary = await buildPreferenceSummary(projectId);
        writeStateFromRows(app, preferences, events, summary);
        return { preferences, events, summary };
    }

    async function open(app) {
        app.showPreferencesPanel = true;
        await load(app);
    }

    function close(app) {
        app.showPreferencesPanel = false;
    }

    async function savePreference(projectId, key, value) {
        if (!db.userPreferences || !projectId || !key) return null;
        const existing = await db.userPreferences.get(prefId(projectId, key));
        const row = normalizePreference({
            id: prefId(projectId, key),
            scope: 'project',
            projectId,
            key,
            value,
            source: 'explicit',
            created: existing?.created || new Date(),
            updatedAt: Date.now()
        });
        await db.userPreferences.put(row);
        return row;
    }

    async function saveExplicitPreferences(app) {
        const projectId = projectIdFrom(app);
        if (!projectId) return [];
        const rows = [];
        rows.push(await savePreference(projectId, PREF_KEYS.plotBeatDensity, BEAT_DENSITIES.has(app.preferenceBeatDensity) ? app.preferenceBeatDensity : 'balanced'));
        rows.push(await savePreference(projectId, PREF_KEYS.plotInstructions, app.preferencePlotGuidance || ''));
        rows.push(await savePreference(projectId, PREF_KEYS.templateSlotGranularity, TEMPLATE_GRANULARITIES.has(app.preferenceTemplateDetail) ? app.preferenceTemplateDetail : 'balanced'));
        rows.push(await savePreference(projectId, PREF_KEYS.templateInstructions, app.preferenceTemplateGuidance || ''));
        rows.push(await savePreference(projectId, PREF_KEYS.styleDefaultTone, app.preferenceDefaultTone || ''));
        await load(app);
        return rows.filter(Boolean);
    }

    async function resetProject(app) {
        const projectId = projectIdFrom(app);
        if (!projectId) return;
        if (db.userPreferences) await db.userPreferences.where('projectId').equals(projectId).delete();
        if (db.tuningEvents) await db.tuningEvents.where('projectId').equals(projectId).delete();
        await load(app);
    }

    function plotPlanSummary(plan, extra = {}) {
        const beats = Array.isArray(plan?.beats) ? plan.beats : [];
        return {
            title: truncate(plan?.name || 'Plot Plan', 100),
            templateId: asString(plan?.templateId || ''),
            beatCount: beats.length,
            selectedCount: Number(extra.selectedCount || beats.filter(beat => beat.selected !== false).length || 0),
            medium: asString(plan?.medium || ''),
            genre: truncate(plan?.genre || '', 80),
            tone: truncate(plan?.tone || '', 80),
            source: asString(plan?.source || '')
        };
    }

    function templateSummary(template) {
        return {
            title: truncate(template?.name || 'Beat Template', 100),
            templateId: asString(template?.id || ''),
            baseTemplateId: asString(template?.baseTemplateId || ''),
            slotCount: Array.isArray(template?.slots) ? template.slots.length : 0,
            medium: asString(template?.medium || ''),
            source: asString(template?.source || '')
        };
    }

    async function recordTuningEvent(appOrProjectId, data) {
        const projectId = projectIdFrom(appOrProjectId);
        if (!db.tuningEvents || !projectId) return null;
        const row = normalizeTuningEvent({
            ...data,
            projectId,
            created: data?.created || new Date(),
            updatedAt: Date.now()
        });
        await db.tuningEvents.put(row);
        if (typeof appOrProjectId === 'object') await load(appOrProjectId);
        return row;
    }

    async function trackPlotPlanDecision(app, plan, decision, extra = {}) {
        if (!plan || !DECISIONS.has(decision)) return null;
        return recordTuningEvent(app, {
            task: 'plot.generate',
            source: decision === 'accepted' ? 'plotPlanAccepted' : 'plotPlanRejected',
            decision,
            targetType: 'plotPlan',
            targetId: asString(plan.id || ''),
            templateId: asString(plan.templateId || ''),
            plotPlanId: asString(plan.id || ''),
            aiRunId: asString(plan.aiRunId || ''),
            summary: plotPlanSummary(plan, extra),
            inference: {
                key: 'plot.reviewedPlan',
                confidence: decision === 'accepted' ? 0.7 : 0.5
            }
        });
    }

    async function trackTemplateDecision(app, template, decision) {
        if (!template || !DECISIONS.has(decision)) return null;
        return recordTuningEvent(app, {
            task: 'template.customize',
            source: decision === 'accepted' ? 'templateAccepted' : 'templateRejected',
            decision,
            targetType: 'beatTemplate',
            targetId: asString(template.id || ''),
            templateId: asString(template.id || template.baseTemplateId || ''),
            aiRunId: asString(template.customization?.aiRunId || ''),
            summary: templateSummary(template),
            inference: {
                key: 'template.reviewedCustomization',
                confidence: decision === 'accepted' ? 0.7 : 0.5
            }
        });
    }

    window.Preferences = {
        PREF_KEYS,
        normalizePreference,
        normalizeTuningEvent,
        preferencesForProject,
        eventsForProject,
        buildPreferenceSummary,
        prepareRequestContext,
        summaryText,
        load,
        open,
        close,
        saveExplicitPreferences,
        resetProject,
        recordTuningEvent,
        trackPlotPlanDecision,
        trackTemplateDecision,
        _test: {
            prefId,
            explicitForTask,
            countEvents,
            eventForSummary,
            plotPlanSummary,
            templateSummary
        }
    };
})();
