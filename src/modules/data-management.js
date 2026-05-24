// Data Management: versioned local JSON backup/import and optional cloud backup entry point.
(function () {
    const FORMAT = 'writingway2.dexie-json';
    const VERSION = 1;
    const TABLES = [
        'projects',
        'chapters',
        'scenes',
        'content',
        'prompts',
        'promptHistory',
        'codex',
        'compendium',
        'workshopSessions',
        'beats',
        'beatTemplates'
    ];

    const tr = (app, key, params) => app && typeof app.t === 'function' ? app.t(key, params) : key;

    function newId(prefix) {
        return Date.now().toString() + '-' + prefix + '-' + Math.random().toString(36).slice(2, 8);
    }

    function safeName(name) {
        return String(name || 'writingway')
            .replace(/[^a-z0-9_-]+/gi, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60) || 'writingway';
    }

    function getFile(eventOrFile) {
        if (eventOrFile && eventOrFile.target && eventOrFile.target.files) {
            return eventOrFile.target.files[0] || null;
        }
        if (typeof File !== 'undefined' && eventOrFile instanceof File) return eventOrFile;
        return null;
    }

    function downloadJson(filename, envelope) {
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function readJsonFile(file) {
        if (!file) throw new Error('No file selected.');
        return JSON.parse(await file.text());
    }

    function assertEnvelope(envelope, expectedScope) {
        if (!envelope || envelope.format !== FORMAT) {
            throw new Error('Unsupported backup format.');
        }
        if (envelope.version !== VERSION) {
            throw new Error('Unsupported backup version.');
        }
        if (expectedScope && envelope.scope !== expectedScope) {
            throw new Error('This backup has the wrong scope.');
        }
        if (!envelope.data || typeof envelope.data !== 'object') {
            throw new Error('Backup data is missing.');
        }
    }

    async function tableToArray(name) {
        if (!db[name]) return [];
        const rows = await db[name].toArray();
        return name === 'beatTemplates' ? normalizeBeatTemplates(rows) : rows;
    }

    function normalizeBeatTemplates(rows) {
        const service = window.BeatTemplateService;
        if (!service || typeof service.normalizeTemplate !== 'function') return rows || [];
        return (rows || []).map(row => service.normalizeTemplate(row));
    }

    function rowsForImport(tableName, rows) {
        if (tableName === 'beatTemplates') return normalizeBeatTemplates(rows);
        return rows;
    }

    async function collectAllData() {
        const data = {};
        for (const tableName of TABLES) {
            data[tableName] = await tableToArray(tableName);
        }
        return data;
    }

    async function collectProjectData(projectId) {
        const project = await db.projects.get(projectId);
        if (!project) throw new Error('Project not found.');

        const chapters = db.chapters ? await db.chapters.where('projectId').equals(projectId).toArray() : [];
        const scenes = db.scenes ? await db.scenes.where('projectId').equals(projectId).toArray() : [];
        const sceneIds = new Set(scenes.map(scene => scene.id));
        const content = db.content ? (await db.content.toArray()).filter(row => sceneIds.has(row.sceneId)) : [];

        return {
            projects: [project],
            chapters,
            scenes,
            content,
            prompts: db.prompts ? await db.prompts.where('projectId').equals(projectId).toArray() : [],
            promptHistory: db.promptHistory ? await db.promptHistory.where('projectId').equals(projectId).toArray() : [],
            codex: db.codex ? await db.codex.where('projectId').equals(projectId).toArray() : [],
            compendium: db.compendium ? await db.compendium.where('projectId').equals(projectId).toArray() : [],
            workshopSessions: db.workshopSessions ? await db.workshopSessions.where('projectId').equals(projectId).toArray() : []
            ,
            beats: db.beats ? await db.beats.where('projectId').equals(projectId).toArray() : [],
            beatTemplates: db.beatTemplates ? normalizeBeatTemplates(await db.beatTemplates.toArray()) : []
        };
    }

    function makeEnvelope(scope, data) {
        return {
            format: FORMAT,
            version: VERSION,
            exportedAt: new Date().toISOString(),
            scope,
            data
        };
    }

    async function replaceAllData(data) {
        await db.transaction('rw', db.tables, async () => {
            for (const table of db.tables) {
                await table.clear();
            }
            for (const tableName of TABLES) {
                if (!db[tableName] || !Array.isArray(data[tableName]) || data[tableName].length === 0) continue;
                await db[tableName].bulkPut(rowsForImport(tableName, data[tableName]));
            }
        });
    }

    function remapProjectData(data) {
        const originalProject = data.projects && data.projects[0];
        if (!originalProject) throw new Error('Project backup is missing project data.');

        const oldProjectId = originalProject.id;
        const newProjectId = newId('proj');
        const chapterMap = new Map();
        const sceneMap = new Map();

        const project = {
            ...originalProject,
            id: newProjectId,
            name: `${originalProject.name || 'Imported Project'} (imported)`,
            created: new Date(),
            modified: new Date(),
            updatedAt: Date.now()
        };

        const chapters = (data.chapters || []).map(chapter => {
            const id = newId('chap');
            chapterMap.set(chapter.id, id);
            return {
                ...chapter,
                id,
                projectId: newProjectId,
                created: chapter.created || new Date(),
                modified: new Date(),
                updatedAt: Date.now()
            };
        });

        const scenes = (data.scenes || []).map(scene => {
            const id = newId('scene');
            sceneMap.set(scene.id, id);
            return {
                ...scene,
                id,
                projectId: newProjectId,
                chapterId: chapterMap.get(scene.chapterId) || scene.chapterId,
                created: scene.created || new Date(),
                modified: new Date(),
                updatedAt: Date.now()
            };
        });

        const remapProjectRow = (row, prefix) => ({
            ...row,
            id: newId(prefix),
            projectId: newProjectId,
            created: row.created || new Date(),
            modified: new Date(),
            updatedAt: Date.now()
        });

        return {
            projectId: newProjectId,
            data: {
                projects: [project],
                chapters,
                scenes,
                content: (data.content || []).map(row => ({
                    ...row,
                    sceneId: sceneMap.get(row.sceneId) || row.sceneId,
                    updatedAt: Date.now()
                })),
                prompts: (data.prompts || []).map(row => remapProjectRow(row, 'prompt')),
                promptHistory: (data.promptHistory || []).map(row => ({
                    ...row,
                    id: newId('hist'),
                    projectId: newProjectId,
                    sceneId: sceneMap.get(row.sceneId) || row.sceneId
                })),
                codex: (data.codex || []).map(row => remapProjectRow(row, 'codex')),
                compendium: (data.compendium || []).map(row => remapProjectRow(row, 'comp')),
                workshopSessions: (data.workshopSessions || []).map(row => remapProjectRow(row, 'workshop'))
                ,
                beats: (data.beats || []).map(row => ({
                    ...row,
                    id: newId('beat'),
                    projectId: newProjectId,
                    chapterId: chapterMap.get(row.chapterId) || row.chapterId || '',
                    sceneId: sceneMap.get(row.sceneId) || row.sceneId || '',
                    modified: new Date(),
                    updatedAt: Date.now()
                })),
                beatTemplates: normalizeBeatTemplates(data.beatTemplates || [])
            }
        };
    }

    async function addProjectData(data) {
        const remapped = remapProjectData(data);
        const rows = remapped.data;
        await db.transaction('rw', db.tables, async () => {
            for (const tableName of TABLES) {
                if (!db[tableName] || !Array.isArray(rows[tableName]) || rows[tableName].length === 0) continue;
                if (tableName === 'beatTemplates') {
                    await db[tableName].bulkPut(rowsForImport(tableName, rows[tableName]));
                } else {
                    await db[tableName].bulkAdd(rows[tableName]);
                }
            }
        });
        return remapped.projectId;
    }

    async function refreshApp(app, projectId) {
        if (window.ProjectManager && typeof window.ProjectManager.loadProjects === 'function') {
            await window.ProjectManager.loadProjects(app);
        } else if (db.projects) {
            app.projects = await db.projects.orderBy('created').reverse().toArray();
        }

        if (projectId && window.ProjectManager && typeof window.ProjectManager.selectProject === 'function') {
            await window.ProjectManager.selectProject(app, projectId);
            return;
        }

        const first = app.projects && app.projects[0];
        if (first && window.ProjectManager && typeof window.ProjectManager.selectProject === 'function') {
            await window.ProjectManager.selectProject(app, first.id);
        } else {
            app.currentProject = null;
            app.currentScene = null;
            app.chapters = [];
            app.scenes = [];
        }
    }

    const DataManagement = {
        open(app) {
            app.showDataManagement = true;
        },

        close(app) {
            app.showDataManagement = false;
        },

        openCloudBackupSettings(app) {
            app.showDataManagement = false;
            if (typeof app.openBackupSettings === 'function') {
                app.openBackupSettings();
                return;
            }
            app.showBackupSettings = true;
        },

        async exportAllData(app) {
            try {
                const envelope = makeEnvelope('all', await collectAllData());
                downloadJson(`writingway2_all_${Date.now()}.json`, envelope);
            } catch (error) {
                alert(tr(app, 'alerts.dataExportFailed', { error: error.message || error }));
            }
        },

        async exportCurrentProject(app) {
            try {
                if (!app.currentProject) {
                    alert(tr(app, 'alerts.noProjectSelected'));
                    return;
                }
                const data = await collectProjectData(app.currentProject.id);
                const envelope = makeEnvelope('project', data);
                downloadJson(`writingway2_project_${safeName(app.currentProject.name)}_${Date.now()}.json`, envelope);
            } catch (error) {
                alert(tr(app, 'alerts.dataExportFailed', { error: error.message || error }));
            }
        },

        async importAllData(app, eventOrFile) {
            try {
                const file = getFile(eventOrFile);
                const envelope = await readJsonFile(file);
                assertEnvelope(envelope, 'all');
                if (!confirm(tr(app, 'alerts.importAllDataConfirm'))) return;
                await replaceAllData(envelope.data);
                await refreshApp(app);
                alert(tr(app, 'alerts.importAllDataSuccess'));
            } catch (error) {
                alert(tr(app, 'alerts.dataImportFailed', { error: error.message || error }));
            }
        },

        async importProject(app, eventOrFile) {
            try {
                const file = getFile(eventOrFile);
                const envelope = await readJsonFile(file);
                assertEnvelope(envelope, 'project');
                const projectId = await addProjectData(envelope.data);
                await refreshApp(app, projectId);
                alert(tr(app, 'alerts.importProjectJsonSuccess'));
            } catch (error) {
                alert(tr(app, 'alerts.dataImportFailed', { error: error.message || error }));
            }
        },

        _test: {
            FORMAT,
            VERSION,
            TABLES,
            collectAllData,
            collectProjectData,
            makeEnvelope,
            assertEnvelope,
            remapProjectData,
            normalizeBeatTemplates
        }
    };

    window.DataManagement = DataManagement;
})();
