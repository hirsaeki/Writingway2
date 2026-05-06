// GitHub Gists Auto-Backup Module
// Handles automatic backup to GitHub Gists and restore functionality

(function () {
    const BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
    let backupIntervalId = null;
    const tr = (app, key, params, fallback) => app && typeof app.t === 'function' ? app.t(key, params, fallback) : (window.t ? window.t(key, params, fallback) : (fallback || key));

    const GitHubBackup = {
        /**
         * Validate GitHub token
         */
        async validateToken(token) {
            try {
                const response = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (response.ok) {
                    const user = await response.json();
                    return { valid: true, username: user.login };
                }
                return { valid: false, error: tr(null, 'alerts.invalidGithubTokenShort') };
            } catch (e) {
                return { valid: false, error: e.message };
            }
        },

        /**
         * Export current project data as JSON
         */
        async exportProjectData(app) {
            if (!app.currentProject) return null;

            try {
                const projectId = app.currentProject.id;

                // Get all data for current project
                const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
                const scenes = await db.scenes.where('projectId').equals(projectId).toArray();

                // Get content for all scenes
                const sceneContents = {};
                for (const scene of scenes) {
                    const content = await db.content.get(scene.id);
                    sceneContents[scene.id] = content ? content.text : '';
                }

                // Get compendium entries (handle if table doesn't exist)
                let compendium = [];
                try {
                    if (db.compendium) {
                        compendium = await db.compendium.where('projectId').equals(projectId).toArray();
                    }
                } catch (e) {
                    console.warn('Could not load compendium:', e);
                }

                // Get prompts (handle if table doesn't exist)
                let prompts = [];
                try {
                    if (db.prompts) {
                        prompts = await db.prompts.where('projectId').equals(projectId).toArray();
                    }
                } catch (e) {
                    console.warn('Could not load prompts:', e);
                }

                return {
                    version: '2.0',
                    exportedAt: new Date().toISOString(),
                    project: app.currentProject,
                    chapters: chapters,
                    scenes: scenes,
                    sceneContents: sceneContents,
                    compendium: compendium,
                    prompts: prompts
                };
            } catch (e) {
                console.error('Error exporting project data:', e);
                return null;
            }
        },

        /**
         * Create or update GitHub Gist with backup
         */
        async backupToGist(app) {
            if (!app.githubToken || !app.currentProject) {
                return { success: false, error: tr(app, 'alerts.noTokenOrProject') };
            }

            try {
                const projectData = await this.exportProjectData(app);
                if (!projectData) {
                    return { success: false, error: tr(app, 'alerts.noProjectData') };
                }

                const filename = `${app.currentProject.name.replace(/[^a-z0-9]/gi, '_')}_backup.json`;
                const description = `Writingway Auto-Backup: ${app.currentProject.name}`;

                // Check if gist already exists
                const gistId = app.currentProjectGistId;

                if (gistId) {
                    // Update existing gist
                    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `token ${app.githubToken}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            description: description,
                            files: {
                                [filename]: {
                                    content: JSON.stringify(projectData, null, 2)
                                }
                            }
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        return {
                            success: true,
                            gistId: data.id,
                            url: data.html_url,
                            updated: true
                        };
                    }
                }

                // Create new gist
                const response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${app.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        description: description,
                        public: false,
                        files: {
                            [filename]: {
                                content: JSON.stringify(projectData, null, 2)
                            }
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    return {
                        success: true,
                        gistId: data.id,
                        url: data.html_url,
                        created: true
                    };
                }

                return { success: false, error: `HTTP ${response.status}` };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },

        /**
         * List all backup versions from gist history
         */
        async listBackups(app) {
            if (!app.githubToken || !app.currentProjectGistId) {
                return { success: false, error: tr(app, 'alerts.noTokenOrGist') };
            }

            try {
                // Get gist with full history
                const response = await fetch(`https://api.github.com/gists/${app.currentProjectGistId}`, {
                    headers: {
                        'Authorization': `token ${app.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    return { success: false, error: `HTTP ${response.status}` };
                }

                const gist = await response.json();

                // Get all versions
                const versions = gist.history || [];

                return {
                    success: true,
                    backups: versions.map(v => ({
                        version: v.version,
                        timestamp: v.committed_at,
                        url: v.url,
                        user: v.user ? v.user.login : 'unknown'
                    }))
                };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },

        /**
         * Restore from a specific backup version
         */
        async restoreFromBackup(app, versionUrl) {
            if (!app.githubToken) {
                return { success: false, error: tr(app, 'alerts.noToken') };
            }

            try {
                const response = await fetch(versionUrl, {
                    headers: {
                        'Authorization': `token ${app.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    return { success: false, error: `HTTP ${response.status}` };
                }

                const gistVersion = await response.json();
                const files = gistVersion.files;
                const firstFile = Object.values(files)[0];

                if (!firstFile) {
                    return { success: false, error: tr(app, 'alerts.noBackupData') };
                }

                const backupData = JSON.parse(firstFile.content);

                // Restore project data
                await this.restoreProjectData(app, backupData);

                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },

        /**
         * Restore project data from backup
         */
        async restoreProjectData(app, backupData) {
            const projectId = backupData.project.id;

            // Update project info
            await db.projects.put(backupData.project);

            // Clear and restore chapters
            await db.chapters.where('projectId').equals(projectId).delete();
            for (const chapter of backupData.chapters) {
                await db.chapters.add(chapter);
            }

            // Clear and restore scenes
            await db.scenes.where('projectId').equals(projectId).delete();
            for (const scene of backupData.scenes) {
                await db.scenes.add(scene);
            }

            // Restore scene contents
            for (const [sceneId, text] of Object.entries(backupData.sceneContents)) {
                const wordCount = text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
                await db.content.put({
                    sceneId: sceneId,
                    text: text,
                    wordCount: wordCount
                });
            }

            // Clear and restore compendium
            await db.compendium.where('projectId').equals(projectId).delete();
            for (const entry of backupData.compendium || []) {
                await db.compendium.add(entry);
            }

            // Clear and restore prompts
            if (backupData.prompts) {
                await db.prompts.where('projectId').equals(projectId).delete();
                for (const prompt of backupData.prompts) {
                    await db.prompts.add(prompt);
                }
            }

            // Reload the project
            await app.selectProject(projectId);
        },

        /**
         * Start auto-backup timer
         */
        startAutoBackup(app) {
            if (backupIntervalId) {
                clearInterval(backupIntervalId);
            }

            backupIntervalId = setInterval(async () => {
                if (app.backupEnabled && app.githubToken && app.currentProject) {
                    app.backupStatus = tr(app, 'status.backingUp');
                    const result = await this.backupToGist(app);

                    if (result.success) {
                        app.lastBackupTime = new Date();
                        app.backupStatus = tr(app, 'status.backedUp');
                        if (result.gistId) {
                            app.currentProjectGistId = result.gistId;
                            this.saveBackupSettings(app);
                        }
                        console.log('✓ Auto-backup successful');
                    } else {
                        app.backupStatus = tr(app, 'status.backupFailed');
                        console.error('Auto-backup failed:', result.error);
                    }
                }
            }, BACKUP_INTERVAL);
        },

        /**
         * Stop auto-backup timer
         */
        stopAutoBackup() {
            if (backupIntervalId) {
                clearInterval(backupIntervalId);
                backupIntervalId = null;
            }
        },

        /**
         * Save backup settings to localStorage
         */
        saveBackupSettings(app) {
            try {
                const settings = {
                    enabled: app.backupEnabled,
                    token: app.githubToken,
                    gistId: app.currentProjectGistId,
                    username: app.githubUsername
                };
                localStorage.setItem('writingway:backupSettings', JSON.stringify(settings));
            } catch (e) {
                console.error('Failed to save backup settings:', e);
            }
        },

        /**
         * Load backup settings from localStorage
         */
        loadBackupSettings(app) {
            try {
                const saved = localStorage.getItem('writingway:backupSettings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    app.backupEnabled = settings.enabled || false;
                    app.githubToken = settings.token || '';
                    app.currentProjectGistId = settings.gistId || '';
                    app.githubUsername = settings.username || '';

                    // Delay auto-backup start to avoid blocking initialization
                    if (app.backupEnabled && app.githubToken) {
                        setTimeout(() => {
                            this.startAutoBackup(app);
                        }, 5000); // Start after 5 seconds
                    }
                }
            } catch (e) {
                console.error('Failed to load backup settings:', e);
            }
        }
    };

    window.GitHubBackup = GitHubBackup;
})();
