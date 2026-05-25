// Plot Planning: persistent draft plot-plan cards and conversion to structural beats.
(function () {
    const STATUSES = new Set(['draft', 'reviewed', 'accepted', 'archived']);
    const MEDIUMS = new Set(['novel', 'screenplay', 'shortStory', 'manga', 'game', 'general']);
    const SOURCES = new Set(['user', 'ai', 'imported']);

    function tr(app, key, params, fallback) {
        if (app && typeof app.t === 'function') return app.t(key, params, fallback);
        return window.t ? window.t(key, params, fallback) : (fallback || key);
    }

    function id(prefix) {
        return Date.now().toString() + '-' + prefix + '-' + Math.random().toString(36).slice(2, 8);
    }

    function nowPatch() {
        const now = new Date();
        return { modified: now, updatedAt: Date.now() };
    }

    function asString(value) {
        return value == null ? '' : String(value);
    }

    function sortSlots(slots) {
        return (slots || []).slice().sort((a, b) => {
            const orderA = Number.isFinite(a.order) ? a.order : 0;
            const orderB = Number.isFinite(b.order) ? b.order : 0;
            return orderA - orderB;
        });
    }

    function normalizeBeatCard(card, index) {
        const input = card && typeof card === 'object' ? card : {};
        const slotId = asString(input.slotId || input.templateSlotId || `manual-${index + 1}`).trim() || `manual-${index + 1}`;
        const slotTitle = asString(input.slotTitle || input.templateSlotTitle || input.title || `Card ${index + 1}`).trim() || `Card ${index + 1}`;
        const title = asString(input.title || slotTitle).trim();
        return {
            id: asString(input.id || id('plotbeat')),
            slotId,
            slotTitle,
            title,
            summary: asString(input.summary || input.body || '').trim(),
            characterArc: asString(input.characterArc || ''),
            conflict: asString(input.conflict || ''),
            sceneIdeas: Array.isArray(input.sceneIdeas) ? input.sceneIdeas.map(asString).filter(Boolean) : [],
            openQuestions: Array.isArray(input.openQuestions) ? input.openQuestions.map(asString).filter(Boolean) : [],
            tags: Array.isArray(input.tags) ? input.tags.map(asString).filter(Boolean) : [],
            selected: input.selected !== false
        };
    }

    function normalizePlotPlan(plan, options = {}) {
        const input = plan && typeof plan === 'object' ? plan : {};
        const now = new Date();
        return {
            ...input,
            id: asString(input.id || options.id || id('plot')),
            projectId: asString(input.projectId || options.projectId || ''),
            templateId: asString(input.templateId || options.templateId || ''),
            name: asString(input.name || options.name || 'Draft Plot Plan').trim() || 'Draft Plot Plan',
            status: STATUSES.has(input.status) ? input.status : 'draft',
            premise: asString(input.premise || ''),
            genre: asString(input.genre || ''),
            targetLength: asString(input.targetLength || ''),
            tone: asString(input.tone || ''),
            medium: MEDIUMS.has(input.medium) ? input.medium : 'novel',
            source: SOURCES.has(input.source) ? input.source : 'user',
            beats: (Array.isArray(input.beats) ? input.beats : []).map(normalizeBeatCard),
            aiRunId: asString(input.aiRunId || ''),
            created: input.created || now,
            modified: input.modified || now,
            updatedAt: input.updatedAt || Date.now()
        };
    }

    function validatePlotPlan(plan) {
        const errors = [];
        if (!plan.projectId) errors.push({ path: '$.projectId', message: 'Project is required.' });
        if (!plan.templateId) errors.push({ path: '$.templateId', message: 'Template is required.' });
        if (!plan.name) errors.push({ path: '$.name', message: 'Name is required.' });
        if (!plan.premise) errors.push({ path: '$.premise', message: 'Premise is required.' });
        if (!Array.isArray(plan.beats) || plan.beats.length === 0) {
            errors.push({ path: '$.beats', message: 'At least one card is required.' });
        }
        (plan.beats || []).forEach((beat, index) => {
            const base = `$.beats[${index}]`;
            if (!beat.slotId) errors.push({ path: `${base}.slotId`, message: 'Slot ID is required.' });
            if (!beat.slotTitle) errors.push({ path: `${base}.slotTitle`, message: 'Slot title is required.' });
            if (!beat.title) errors.push({ path: `${base}.title`, message: 'Card title is required.' });
            if (!beat.summary) errors.push({ path: `${base}.summary`, message: 'Card summary is required.' });
        });
        return { ok: errors.length === 0, errors };
    }

    function planFromState(app) {
        return normalizePlotPlan({
            id: app.currentPlotPlanId || '',
            projectId: app.currentProject?.id || '',
            templateId: app.plotPlanTemplateId || '',
            name: app.plotPlanName || '',
            status: app.plotPlanStatus || 'draft',
            premise: app.plotPlanPremise || '',
            genre: app.plotPlanGenre || '',
            targetLength: app.plotPlanTargetLength || '',
            tone: app.plotPlanTone || '',
            medium: app.plotPlanMedium || 'novel',
            source: 'user',
            beats: app.plotPlanCards || [],
            created: app.currentPlotPlanCreated || undefined
        });
    }

    function writeStateFromPlan(app, plan) {
        const normalized = normalizePlotPlan(plan);
        app.currentPlotPlanId = normalized.id;
        app.currentPlotPlanCreated = normalized.created;
        app.plotPlanTemplateId = normalized.templateId;
        app.plotPlanName = normalized.name;
        app.plotPlanStatus = normalized.status;
        app.plotPlanPremise = normalized.premise;
        app.plotPlanGenre = normalized.genre;
        app.plotPlanTargetLength = normalized.targetLength;
        app.plotPlanTone = normalized.tone;
        app.plotPlanMedium = normalized.medium;
        app.plotPlanCards = normalized.beats.map(card => ({ ...card }));
    }

    function clearDraft(app) {
        app.currentPlotPlanId = '';
        app.currentPlotPlanCreated = null;
        app.plotPlanStatus = 'draft';
        app.plotPlanName = '';
        app.plotPlanPremise = '';
        app.plotPlanGenre = '';
        app.plotPlanTargetLength = '';
        app.plotPlanTone = '';
        app.plotPlanMedium = 'novel';
        app.plotPlanCards = [];
        app.newPlotPlanCardTitle = '';
        app.newPlotPlanCardSummary = '';
    }

    async function ensureTemplatesLoaded(app) {
        if (window.Beats && typeof window.Beats.loadTemplates === 'function') {
            await window.Beats.loadTemplates(app);
        } else if (db.beatTemplates) {
            const service = window.BeatTemplateService;
            const rows = await db.beatTemplates.toArray();
            app.beatTemplates = service ? rows.map(row => service.normalizeTemplate(row)) : rows;
        }
    }

    async function loadPlans(app) {
        if (!app.currentProject || !db.plotPlans) {
            app.plotPlans = [];
            return [];
        }
        const rows = await db.plotPlans.where('projectId').equals(app.currentProject.id).toArray();
        rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        app.plotPlans = rows.map(row => normalizePlotPlan(row));
        return app.plotPlans;
    }

    async function open(app) {
        app.showPlotPlanningPanel = true;
        app.showBeatsPanel = false;
        await ensureTemplatesLoaded(app);
        await loadPlans(app);
        if (!app.plotPlanTemplateId && app.beatTemplates && app.beatTemplates[0]) {
            app.plotPlanTemplateId = app.beatTemplates[0].id;
        }
    }

    function close(app) {
        app.showPlotPlanningPanel = false;
    }

    async function createDraftFromTemplate(app) {
        if (!app.currentProject || !app.plotPlanTemplateId) return null;
        await ensureTemplatesLoaded(app);
        const templateRow = await db.beatTemplates.get(app.plotPlanTemplateId);
        const service = window.BeatTemplateService;
        const template = service ? service.normalizeTemplate(templateRow) : templateRow;
        if (!template || !Array.isArray(template.slots) || template.slots.length === 0) return null;
        const cards = sortSlots(template.slots).map((slot, index) => normalizeBeatCard({
            id: id('plotbeat'),
            slotId: slot.id || `slot-${index + 1}`,
            slotTitle: slot.title || `Slot ${index + 1}`,
            title: slot.title || `Card ${index + 1}`,
            summary: slot.promptHint || slot.description || slot.purpose || slot.title || '',
            tags: Array.isArray(template.tags) ? template.tags : [],
            selected: true
        }, index));
        const draft = normalizePlotPlan({
            projectId: app.currentProject.id,
            templateId: template.id,
            name: app.plotPlanName || `${template.name} Plot`,
            status: 'draft',
            premise: app.plotPlanPremise || '',
            genre: app.plotPlanGenre || '',
            targetLength: app.plotPlanTargetLength || '',
            tone: app.plotPlanTone || '',
            medium: template.medium || 'novel',
            source: 'user',
            beats: cards
        });
        writeStateFromPlan(app, draft);
        return draft;
    }

    function addCard(app) {
        const title = asString(app.newPlotPlanCardTitle).trim();
        const summary = asString(app.newPlotPlanCardSummary).trim();
        if (!title || !summary) return null;
        const card = normalizeBeatCard({
            id: id('plotbeat'),
            slotId: `manual-${Date.now()}`,
            slotTitle: title,
            title,
            summary,
            selected: true
        }, (app.plotPlanCards || []).length);
        app.plotPlanCards = (app.plotPlanCards || []).concat(card);
        app.newPlotPlanCardTitle = '';
        app.newPlotPlanCardSummary = '';
        return card;
    }

    function removeCard(app, cardId) {
        app.plotPlanCards = (app.plotPlanCards || []).filter(card => card.id !== cardId);
    }

    async function savePlan(app) {
        if (!db.plotPlans) throw new Error('plotPlans table is unavailable.');
        const plan = planFromState(app);
        const validation = validatePlotPlan(plan);
        if (!validation.ok) {
            const summary = validation.errors.map(error => `${error.path}: ${error.message}`).join('\n');
            throw new Error(tr(app, 'alerts.plotPlanInvalid', { error: summary }, `Plot plan is invalid: ${summary}`));
        }
        const existing = plan.id ? await db.plotPlans.get(plan.id) : null;
        const row = {
            ...plan,
            id: existing?.id || plan.id || id('plot'),
            created: existing?.created || plan.created || new Date(),
            ...nowPatch()
        };
        await db.plotPlans.put(row);
        writeStateFromPlan(app, row);
        await loadPlans(app);
        return row;
    }

    async function loadPlan(app, planId) {
        if (!planId || !db.plotPlans) return null;
        const plan = await db.plotPlans.get(planId);
        if (!plan) return null;
        writeStateFromPlan(app, plan);
        return normalizePlotPlan(plan);
    }

    async function deletePlan(app, planId) {
        if (!planId || !db.plotPlans) return;
        await db.plotPlans.delete(planId);
        if (app.currentPlotPlanId === planId) clearDraft(app);
        await loadPlans(app);
    }

    async function saveSelectedAsBeats(app) {
        if (!app.currentProject || !db.beats) return [];
        const plan = planFromState(app);
        const selectedCards = (plan.beats || []).filter(card => card.selected !== false);
        if (selectedCards.length === 0) return [];
        const validation = validatePlotPlan({ ...plan, beats: selectedCards });
        if (!validation.ok) {
            const summary = validation.errors.map(error => `${error.path}: ${error.message}`).join('\n');
            throw new Error(tr(app, 'alerts.plotPlanInvalid', { error: summary }, `Plot plan is invalid: ${summary}`));
        }
        if (!app.currentPlotPlanId) {
            const persisted = await savePlan(app);
            plan.id = persisted.id;
        }
        const start = await db.beats.where('projectId').equals(app.currentProject.id).count();
        const rows = selectedCards.map((card, index) => ({
            id: id('beat'),
            projectId: app.currentProject.id,
            chapterId: '',
            sceneId: '',
            scope: 'project',
            title: card.title,
            body: card.summary,
            order: start + index,
            status: 'planned',
            templateId: plan.templateId,
            templateSlotId: card.slotId,
            templateSlotTitle: card.slotTitle,
            templateSlotOrder: index,
            plotPlanId: plan.id,
            plotPlanBeatId: card.id,
            tags: Array.isArray(card.tags) ? card.tags.slice() : [],
            created: new Date(),
            modified: new Date(),
            updatedAt: Date.now()
        }));
        await db.beats.bulkAdd(rows);
        if (window.Beats && typeof window.Beats.loadBeats === 'function') {
            await window.Beats.loadBeats(app);
        }
        return rows;
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

    window.PlotPlanning = {
        open,
        close,
        loadPlans,
        loadPlan,
        clearDraft,
        createDraftFromTemplate,
        addCard,
        removeCard,
        savePlan,
        deletePlan,
        saveSelectedAsBeats,
        normalizePlotPlan,
        normalizeBeatCard,
        normalizeAiRun,
        validatePlotPlan,
        _test: {
            id,
            planFromState,
            writeStateFromPlan,
            sortSlots
        }
    };
})();
