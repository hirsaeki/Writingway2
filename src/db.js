/**
 * Database Module
 * Handles Dexie initialization, schema definitions, and migrations
 */

const BeatTemplateService = (function () {
    const MEDIUMS = new Set(['novel', 'screenplay', 'shortStory', 'manga', 'game', 'general']);
    const SOURCES = new Set(['builtIn', 'custom', 'imported', 'aiCustomized']);

    function slugifySlotId(value, index) {
        const slug = String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || `slot-${index + 1}`;
    }

    function normalizePosition(position) {
        if (!position || typeof position !== 'object') return null;
        const percentStart = Number(position.percentStart);
        const percentEnd = Number(position.percentEnd);
        if (!Number.isFinite(percentStart) || !Number.isFinite(percentEnd)) return null;
        return {
            percentStart: Math.max(0, Math.min(100, percentStart)),
            percentEnd: Math.max(0, Math.min(100, percentEnd))
        };
    }

    function normalizeSlot(slot, index, usedIds) {
        const input = slot && typeof slot === 'object' && !Array.isArray(slot) ? slot : { title: String(slot || '') };
        const title = String(input.title || `Slot ${index + 1}`).trim() || `Slot ${index + 1}`;
        let slotId = input.id ? String(input.id).trim() : slugifySlotId(title, index);
        if (!slotId) slotId = `slot-${index + 1}`;
        if (usedIds) {
            const base = slotId;
            let suffix = 2;
            while (usedIds.has(slotId)) {
                slotId = `${base}-${suffix}`;
                suffix += 1;
            }
            usedIds.add(slotId);
        }
        const order = Number(input.order);
        return {
            id: slotId,
            title,
            order: Number.isFinite(order) && order >= 0 ? Math.floor(order) : index,
            description: String(input.description || ''),
            purpose: String(input.purpose || ''),
            recommendedPosition: normalizePosition(input.recommendedPosition),
            promptHint: String(input.promptHint || ''),
            requiredInputs: Array.isArray(input.requiredInputs) ? input.requiredInputs.map(String) : [],
            outputSchema: input.outputSchema && typeof input.outputSchema === 'object' ? input.outputSchema : null,
            examples: Array.isArray(input.examples) ? input.examples.map(String) : []
        };
    }

    function normalizeTemplate(template) {
        const input = template && typeof template === 'object' ? template : {};
        const usedIds = new Set();
        const slots = (Array.isArray(input.slots) ? input.slots : [])
            .map((slot, index) => normalizeSlot(slot, index, usedIds));
        const builtIn = Boolean(input.builtIn);
        const source = SOURCES.has(input.source) ? input.source : (builtIn ? 'builtIn' : 'custom');
        const medium = MEDIUMS.has(input.medium) ? input.medium : 'general';
        return {
            ...input,
            id: String(input.id || '').trim(),
            name: String(input.name || 'Untitled Template').trim() || 'Untitled Template',
            version: 2,
            builtIn,
            source,
            baseTemplateId: String(input.baseTemplateId || ''),
            description: String(input.description || ''),
            medium,
            tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
            slots
        };
    }

    function slot(id, title, order, description, purpose, percentStart, percentEnd, promptHint, requiredInputs) {
        return {
            id,
            title,
            order,
            description,
            purpose,
            recommendedPosition: { percentStart, percentEnd },
            promptHint,
            requiredInputs: requiredInputs || [],
            outputSchema: null,
            examples: []
        };
    }

    function template(id, name, description, tags, slots) {
        return {
            id,
            name,
            version: 2,
            builtIn: true,
            source: 'builtIn',
            baseTemplateId: '',
            description,
            medium: 'general',
            tags,
            slots
        };
    }

    function builtInTemplates() {
        return [
            template('preset-three-act', 'Three Act Structure', 'A general seven-step three-act story structure.', ['structure', 'three-act'], [
                slot('setup', 'Setup', 0, 'Introduce the ordinary world, protagonist, central desire, and starting conflict.', 'Establish context and make the audience understand what can change.', 0, 15, 'Establish the protagonist, world, tone, initial desire, and unresolved tension.', ['premise', 'protagonist']),
                slot('inciting-incident', 'Inciting Incident', 1, 'The event that disrupts normal life and creates the story problem.', 'Force the protagonist to respond to a meaningful change.', 10, 20, 'Create a clear disruption that cannot be ignored.', ['premise']),
                slot('first-plot-point', 'First Plot Point', 2, 'A commitment or turn that moves the story into its main conflict.', 'Lock the protagonist into the central dramatic path.', 20, 30, 'Show a choice or event that commits the protagonist to the main story.', ['premise', 'stakes']),
                slot('midpoint', 'Midpoint', 3, 'A major reversal, discovery, or escalation near the center of the story.', 'Change the protagonist strategy and raise stakes.', 45, 55, 'Deliver a reversal or revelation that changes the meaning of the goal.', ['stakes']),
                slot('second-plot-point', 'Second Plot Point', 4, 'The turn that launches the final movement toward resolution.', 'Push the story from reaction into final action.', 70, 80, 'Force a final commitment, sacrifice, or plan.', ['protagonist', 'stakes']),
                slot('climax', 'Climax', 5, 'The decisive confrontation or choice.', 'Resolve the main dramatic question through action.', 85, 95, 'Resolve the core conflict through a concrete, transformed action.', ['premise']),
                slot('resolution', 'Resolution', 6, 'The aftermath that shows consequences and changed conditions.', 'Give emotional and practical closure.', 95, 100, 'Show what changed and what remains after the climax.', ['theme'])
            ]),
            template('preset-save-the-cat', 'Save the Cat / BS2', 'A legacy simplified seven-slot Save the Cat style template.', ['structure', 'bs2', 'legacy'], [
                slot('opening-image', 'Opening Image', 0, 'A snapshot of the protagonist or world before transformation.', 'Create contrast with the ending.', 0, 1, 'Show the starting state before the main transformation.', ['premise', 'protagonist']),
                slot('theme-stated', 'Theme Stated', 1, 'A hint of the moral or emotional argument.', 'Plant the story theme without resolving it.', 1, 5, 'Let a situation or character suggest the thematic question.', ['theme']),
                slot('catalyst', 'Catalyst', 2, 'The disruption that starts the story problem.', 'Break the status quo.', 10, 12, 'Introduce the event that makes the old life impossible.', ['premise']),
                slot('break-into-two', 'Break into Two', 3, 'The commitment into a new world or story mode.', 'Start the main journey.', 20, 25, 'Show the protagonist crossing into the main conflict.', ['protagonist']),
                slot('midpoint', 'Midpoint', 4, 'A major reversal, false victory, or false defeat.', 'Escalate stakes and redirect the story.', 45, 55, 'Change the goal, stakes, or power balance sharply.', ['stakes']),
                slot('all-is-lost', 'All Is Lost', 5, 'The apparent defeat or irreversible loss.', 'Strip away the old strategy and force inner change.', 68, 75, 'Make defeat feel costly and specific.', ['protagonist', 'stakes']),
                slot('finale', 'Finale', 6, 'The final confrontation and resolution.', 'Resolve conflict through transformed action.', 85, 99, 'Resolve the main conflict with choices that prove transformation.', ['theme'])
            ]),
            template('preset-save-the-cat-bs2-v2', 'Save the Cat / BS2 Full', 'A full 15-beat commercial story structure template.', ['structure', 'bs2', 'full'], [
                slot('opening-image', 'Opening Image', 0, 'A snapshot of the protagonist/world before the main transformation.', 'Establish the starting state and create contrast with the ending.', 0, 1, 'Show the ordinary world, mood, protagonist state, and central lack without explaining the whole plot.', ['premise', 'protagonist']),
                slot('theme-stated', 'Theme Stated', 1, 'A line, scene, or situation that plants the story moral or emotional argument.', 'Introduce what the protagonist must learn or confront internally.', 1, 5, 'Plant the thematic question naturally through conflict, advice, irony, or a small moment.', ['theme']),
                slot('setup', 'Set-Up', 2, 'The ordinary world, central cast, flaws, wants, stakes, and missing pieces.', 'Make the starting life concrete enough that disruption matters.', 1, 10, 'Establish normal life, desire, flaw, pressure, relationships, and what is at risk.', ['premise', 'protagonist', 'setting']),
                slot('catalyst', 'Catalyst', 3, 'The external event that disrupts the status quo.', 'Create a problem or opportunity that demands response.', 10, 12, 'Introduce the event that makes staying the same impossible or costly.', ['premise']),
                slot('debate', 'Debate', 4, 'Resistance, doubt, uncertainty, or failed attempts before commitment.', 'Show why the next step is difficult and emotionally loaded.', 12, 20, 'Explore reluctance, alternatives, fear, denial, or practical obstacles before commitment.', ['protagonist', 'stakes']),
                slot('break-into-two', 'Break into Two', 5, 'A choice or event commits the protagonist to the new world.', 'Move from setup into the main story engine.', 20, 25, 'Show an active crossing into the quest, relationship, mystery, conflict, or new mode.', ['premise', 'protagonist']),
                slot('b-story', 'B Story', 6, 'A relationship or secondary thread that carries theme pressure.', 'Give the inner arc a visible pressure point.', 22, 30, 'Introduce or deepen the relationship, mentor, rival, or subplot that reflects the theme.', ['theme', 'supporting cast']),
                slot('fun-and-games', 'Fun and Games', 7, 'Exploration of the premise promise with complications, discoveries, and set pieces.', 'Deliver the reason the reader came while testing the new world.', 25, 50, 'Show the premise in action through victories, failures, reversals, discoveries, and escalating complications.', ['premise', 'genre']),
                slot('midpoint', 'Midpoint', 8, 'A major reversal, false win, false loss, public exposure, or stakes escalation.', 'Change the protagonist strategy and raise pressure.', 45, 55, 'Create a central turn that changes what success or failure means.', ['stakes']),
                slot('bad-guys-close-in', 'Bad Guys Close In', 9, 'External and internal pressures tighten after the midpoint.', 'Make the old plan fail from multiple directions.', 50, 68, 'Escalate opposition, mistakes, betrayals, doubts, and consequences until pressure becomes unsustainable.', ['antagonist', 'protagonist']),
                slot('all-is-lost', 'All Is Lost', 10, 'The apparent defeat or irreversible loss.', 'Strip away hope and expose the cost of the flaw.', 68, 75, 'Deliver a concrete defeat, loss, betrayal, or failure that feels final.', ['stakes']),
                slot('dark-night-of-the-soul', 'Dark Night of the Soul', 11, 'The protagonist processes defeat and confronts the inner flaw.', 'Turn loss into insight before the final act.', 75, 80, 'Let the protagonist sit with the consequences and recognize what must change.', ['theme', 'protagonist']),
                slot('break-into-three', 'Break into Three', 12, 'A synthesis of plot and theme becomes a final plan or transformed choice.', 'Launch the final act from new understanding.', 80, 85, 'Show a transformed decision or plan that combines external strategy with inner change.', ['theme', 'stakes']),
                slot('finale', 'Finale', 13, 'The final sequence resolves conflict through transformed action.', 'Prove the arc and settle the central dramatic question.', 85, 99, 'Escalate and resolve the final conflict through choices only the changed protagonist can make.', ['protagonist', 'theme']),
                slot('final-image', 'Final Image', 14, 'A final snapshot contrasting with the opening image.', 'Confirm transformation and emotional closure.', 99, 100, 'Show the changed world, changed protagonist, or changed relationship in a concise final image.', ['theme'])
            ]),
            template('preset-hero-journey', "Hero's Journey", 'A seven-step simplified heroic journey structure.', ['structure', 'hero-journey'], [
                slot('ordinary-world', 'Ordinary World', 0, 'The hero in familiar conditions before adventure.', 'Establish what will be left behind or transformed.', 0, 10, 'Show the hero in their normal world, desire, flaw, and constraint.', ['protagonist', 'setting']),
                slot('call-to-adventure', 'Call to Adventure', 1, 'The invitation or problem that calls the hero forward.', 'Open the path to transformation.', 10, 20, 'Introduce the call and why it matters.', ['premise']),
                slot('crossing-the-threshold', 'Crossing the Threshold', 2, 'The hero enters the special world or main conflict.', 'Commit the hero to change.', 20, 30, 'Show the irreversible crossing into unfamiliar stakes.', ['protagonist']),
                slot('ordeal', 'Ordeal', 3, 'A severe test that confronts fear, flaw, or opposition.', 'Force growth through pressure.', 45, 60, 'Make the hero face a meaningful test with real cost.', ['stakes']),
                slot('reward', 'Reward', 4, 'The hero gains knowledge, power, relationship, or advantage.', 'Show partial transformation or earned progress.', 60, 70, 'Give the hero an earned reward that changes the path.', ['theme']),
                slot('road-back', 'Road Back', 5, 'The return path creates renewed danger or final pursuit.', 'Convert reward into final responsibility.', 70, 85, 'Push the hero toward the final confrontation or return.', ['stakes']),
                slot('return', 'Return', 6, 'The hero returns changed with resolution or boon.', 'Complete the transformation and show impact.', 85, 100, 'Show how the hero and world are different after the journey.', ['theme'])
            ]),
            template('preset-kishotenketsu', 'Kishotenketsu', 'A four-part structure built on introduction, development, twist, and reconciliation.', ['structure', 'kishotenketsu'], [
                slot('ki', 'Ki', 0, 'Introduction of situation, characters, and setting.', 'Ground the reader before development.', 0, 25, 'Introduce the world, character, and situation with clarity and restraint.', ['setting', 'protagonist']),
                slot('sho', 'Sho', 1, 'Development and elaboration without major confrontation.', 'Deepen pattern, context, and expectation.', 25, 50, 'Develop the initial material and let the reader understand the pattern.', ['premise']),
                slot('ten', 'Ten', 2, 'A turn, contrast, or twist that reframes the prior material.', 'Create surprise and new meaning.', 50, 75, 'Introduce a turn that changes interpretation without relying only on conflict.', ['theme']),
                slot('ketsu', 'Ketsu', 3, 'Conclusion that reconciles introduction, development, and turn.', 'Resolve meaning and emotional shape.', 75, 100, 'Bring the elements together and show the resulting meaning or consequence.', ['theme'])
            ])
        ].map(normalizeTemplate);
    }

    return {
        slugifySlotId,
        normalizeSlot,
        normalizeTemplate,
        builtInTemplates
    };
})();

try { window.BeatTemplateService = window.BeatTemplateService || BeatTemplateService; } catch (e) { /* ignore in non-browser env */ }

// Initialize Dexie Database with a migration path
const db = new Dexie('WritingwayDB');

// Original schema (version 1) - ensures compatibility with existing installs
db.version(1).stores({
    projects: 'id, name, created, modified',
    scenes: 'id, projectId, title, order, created, modified',
    content: 'sceneId, text, wordCount'
});

// New schema (version 2) adds chapters and scene.chapterId. Use upgrade() to migrate orphan scenes.
db.version(2).stores({
    projects: 'id, name, created, modified',
    chapters: 'id, projectId, title, order, created, modified',
    scenes: 'id, projectId, chapterId, title, order, created, modified',
    content: 'sceneId, text, wordCount'
}).upgrade(async tx => {
    try {
        const projects = await tx.table('projects').toArray();
        for (const p of projects) {
            // Create a default chapter for the project
            const chapId = Date.now().toString() + '-m-' + Math.random().toString(36).slice(2, 7);
            await tx.table('chapters').add({
                id: chapId,
                projectId: p.id,
                title: 'Chapter 1',
                order: 0,
                created: new Date(),
                modified: new Date()
            });

            // Move orphan scenes (no chapterId) into the new default chapter
            const orphanScenes = await tx.table('scenes').where('projectId').equals(p.id).filter(s => !s.chapterId).toArray();
            for (const s of orphanScenes) {
                await tx.table('scenes').update(s.id, { chapterId: chapId });
            }
        }
    } catch (e) {
        // If migration fails for any reason, log but don't block opening the DB
        console.error('Dexie upgrade migration failed:', e);
    }
});

// Add prompts and codex tables (v3)
db.version(3).stores({
    prompts: 'id, projectId, category, title, created, modified',
    codex: 'id, projectId, title, created, modified'
}).upgrade(async tx => {
    // noop migration for now; existing installs will get empty prompts/codex
});

// Add compendium table (v4)
db.version(4).stores({
    compendium: 'id, projectId, category, title, modified, tags'
}).upgrade(async tx => {
    // noop migration; new installs will get empty compendium
});

// Add compound index for compendium queries to speed up category lookups
// This creates a compound index on [projectId+category] which Dexie will use
// when querying by both fields together (e.g., { projectId, category }).
// Use a new DB version so existing installs get the index via Dexie migration.
db.version(5).stores({
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags'
}).upgrade(async tx => {
    // noop: index addition handled by Dexie
});

// Add prompt history table (v6)
db.version(6).stores({
    projects: 'id, name, created, modified',
    chapters: 'id, projectId, title, order, created, modified',
    scenes: 'id, projectId, chapterId, title, order, created, modified',
    content: 'sceneId, text, wordCount',
    prompts: 'id, projectId, category, title, created, modified',
    codex: 'id, projectId, title, created, modified',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt'
}).upgrade(async tx => {
    // noop: new table for prompt history
});

// Add workshopSessions table for Workshop Chat feature (v7)
db.version(7).stores({
    projects: 'id, name, created, modified',
    chapters: 'id, projectId, title, order, created, modified',
    scenes: 'id, projectId, chapterId, title, order, created, modified',
    content: 'sceneId, text, wordCount',
    prompts: 'id, projectId, category, title, created, modified',
    codex: 'id, projectId, title, created, modified',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt'
}).upgrade(async tx => {
    // noop: new table will be created automatically
});

// Add updatedAt timestamps for multi-tab sync (v8)
db.version(8).stores({
    projects: 'id, name, created, modified, updatedAt',
    chapters: 'id, projectId, title, order, created, modified, updatedAt',
    scenes: 'id, projectId, chapterId, title, order, created, modified, updatedAt',
    content: 'sceneId, text, wordCount, updatedAt',
    prompts: 'id, projectId, category, title, created, modified, updatedAt',
    codex: 'id, projectId, title, created, modified, updatedAt',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags, updatedAt',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt'
}).upgrade(async tx => {
    // Add updatedAt to existing records
    const now = Date.now();

    await tx.table('projects').toCollection().modify(proj => {
        if (!proj.updatedAt) proj.updatedAt = now;
    });

    await tx.table('chapters').toCollection().modify(ch => {
        if (!ch.updatedAt) ch.updatedAt = now;
    });

    await tx.table('scenes').toCollection().modify(sc => {
        if (!sc.updatedAt) sc.updatedAt = now;
    });

    await tx.table('content').toCollection().modify(cont => {
        if (!cont.updatedAt) cont.updatedAt = now;
    });

    await tx.table('prompts').toCollection().modify(pr => {
        if (!pr.updatedAt) pr.updatedAt = now;
    });

    await tx.table('codex').toCollection().modify(cd => {
        if (!cd.updatedAt) cd.updatedAt = now;
    });

    await tx.table('compendium').toCollection().modify(comp => {
        if (!comp.updatedAt) comp.updatedAt = now;
    });
});

// Normalize prompt taxonomy defaults (v9). Existing known categories are preserved;
// missing or unknown categories are grouped as custom prompts.
db.version(9).stores({
    projects: 'id, name, created, modified, updatedAt',
    chapters: 'id, projectId, title, order, created, modified, updatedAt',
    scenes: 'id, projectId, chapterId, title, order, created, modified, updatedAt',
    content: 'sceneId, text, wordCount, updatedAt',
    prompts: 'id, projectId, category, title, created, modified, updatedAt',
    codex: 'id, projectId, title, created, modified, updatedAt',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags, updatedAt',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt'
}).upgrade(async tx => {
    const supported = new Set(['structure', 'prose', 'style', 'rewrite', 'summary', 'workshop', 'custom']);
    await tx.table('prompts').toCollection().modify(prompt => {
        if (!supported.has(prompt.category)) {
            prompt.category = 'custom';
        }
        if (!prompt.updatedAt) prompt.updatedAt = Date.now();
    });
});

// Real structural Beats (v10), separate from generation Briefs.
db.version(10).stores({
    projects: 'id, name, created, modified, updatedAt',
    chapters: 'id, projectId, title, order, created, modified, updatedAt',
    scenes: 'id, projectId, chapterId, title, order, created, modified, updatedAt',
    content: 'sceneId, text, wordCount, updatedAt',
    prompts: 'id, projectId, category, title, created, modified, updatedAt',
    codex: 'id, projectId, title, created, modified, updatedAt',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags, updatedAt',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt',
    beats: 'id, projectId, chapterId, sceneId, scope, order, status, templateId, templateSlotId, modified'
}).upgrade(async tx => {
    // new table only
});

// Beat templates and structure presets (v11).
db.version(11).stores({
    projects: 'id, name, created, modified, updatedAt',
    chapters: 'id, projectId, title, order, created, modified, updatedAt',
    scenes: 'id, projectId, chapterId, title, order, created, modified, updatedAt',
    content: 'sceneId, text, wordCount, updatedAt',
    prompts: 'id, projectId, category, title, created, modified, updatedAt',
    codex: 'id, projectId, title, created, modified, updatedAt',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags, updatedAt',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt',
    beats: 'id, projectId, chapterId, sceneId, scope, order, status, templateId, templateSlotId, modified',
    beatTemplates: 'id, name, builtIn, modified'
}).upgrade(async tx => {
    const now = new Date();
    const presets = [
        {
            id: 'preset-three-act',
            name: 'Three Act Structure',
            builtIn: true,
            slots: ['Setup', 'Inciting Incident', 'First Plot Point', 'Midpoint', 'Second Plot Point', 'Climax', 'Resolution']
        },
        {
            id: 'preset-save-the-cat',
            name: 'Save the Cat / BS2',
            builtIn: true,
            slots: ['Opening Image', 'Theme Stated', 'Catalyst', 'Break into Two', 'Midpoint', 'All Is Lost', 'Finale']
        },
        {
            id: 'preset-hero-journey',
            name: "Hero's Journey",
            builtIn: true,
            slots: ['Ordinary World', 'Call to Adventure', 'Crossing the Threshold', 'Ordeal', 'Reward', 'Road Back', 'Return']
        },
        {
            id: 'preset-kishotenketsu',
            name: 'Kishotenketsu',
            builtIn: true,
            slots: ['Ki', 'Sho', 'Ten', 'Ketsu']
        }
    ];
    for (const preset of presets) {
        await tx.table('beatTemplates').put({ ...preset, created: now, modified: now });
    }
});

// Beat template v2 slot objects and full BS2 preset (v12).
db.version(12).stores({
    projects: 'id, name, created, modified, updatedAt',
    chapters: 'id, projectId, title, order, created, modified, updatedAt',
    scenes: 'id, projectId, chapterId, title, order, created, modified, updatedAt',
    content: 'sceneId, text, wordCount, updatedAt',
    prompts: 'id, projectId, category, title, created, modified, updatedAt',
    codex: 'id, projectId, title, created, modified, updatedAt',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags, updatedAt',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt',
    beats: 'id, projectId, chapterId, sceneId, scope, order, status, templateId, templateSlotId, modified',
    beatTemplates: 'id, name, builtIn, modified'
}).upgrade(async tx => {
    const table = tx.table('beatTemplates');
    const now = new Date();
    const timestamp = Date.now();
    const existingRows = await table.toArray();

    for (const row of existingRows) {
        const normalized = BeatTemplateService.normalizeTemplate(row);
        await table.put({
            ...normalized,
            created: row.created || now,
            modified: row.modified || now,
            updatedAt: row.updatedAt || timestamp
        });
    }

    for (const preset of BeatTemplateService.builtInTemplates()) {
        const existing = await table.get(preset.id);
        if (!existing || existing.builtIn === true) {
            await table.put({
                ...preset,
                created: existing?.created || now,
                modified: now,
                updatedAt: timestamp
            });
        }
    }
});

// Plot planning records and AI run metadata (v13).
db.version(13).stores({
    projects: 'id, name, created, modified, updatedAt',
    chapters: 'id, projectId, title, order, created, modified, updatedAt',
    scenes: 'id, projectId, chapterId, title, order, created, modified, updatedAt',
    content: 'sceneId, text, wordCount, updatedAt',
    prompts: 'id, projectId, category, title, created, modified, updatedAt',
    codex: 'id, projectId, title, created, modified, updatedAt',
    compendium: 'id, [projectId+category], projectId, category, title, modified, tags, updatedAt',
    promptHistory: 'id, projectId, sceneId, timestamp, beat, prompt',
    workshopSessions: 'id, projectId, name, createdAt, updatedAt',
    beats: 'id, projectId, chapterId, sceneId, scope, order, status, templateId, templateSlotId, modified',
    beatTemplates: 'id, name, builtIn, modified',
    plotPlans: 'id, projectId, templateId, status, created, modified, updatedAt',
    aiRuns: 'id, projectId, task, provider, model, status, created, updatedAt'
}).upgrade(async tx => {
    // New tables only. Existing project/scene/beat data is left untouched.
});

// Expose the global Dexie instance for debugging and console usage
try { window.db = window.db || db; } catch (e) { /* ignore in non-browser env */ }

// Note: Dexie will open when first used; no automatic recovery toggles are present.
