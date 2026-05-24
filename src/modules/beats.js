// Structural story Beats, separate from generation Briefs.
(function () {
    const TEMPLATE_FORMAT = 'writingway2.beat-template';
    const TEMPLATE_VERSION = 2;
    const TemplateService = window.BeatTemplateService;

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
        getBeatReferencesForScene,
        _test: {
            TEMPLATE_FORMAT,
            TEMPLATE_VERSION,
            normalizeSlot,
            normalizeTemplate,
            slugifySlotId: TemplateService.slugifySlotId,
            makeTemplateEnvelope,
            parseTemplateEnvelope,
            sortSlots
        }
    };
})();
