const Project = require('../models/Project');
const { knex: db } = require('../database'); // Use knex for Badges logic if not moved to Model, or move to Model?
// Actually Project.countByAuthor is in Model now. 
// Badges logic is hybrid (User Badges, generic Badges table).
// We can use db (knex) here for that.
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const showdown = require('showdown');
const converter = new showdown.Converter();

// Helper function
const uploadDir = path.join(__dirname, '../uploads/projects');

// Process Projects Helper
const processProjects = (projects) => {
    return projects.map(project => {
        let bannerImage = '/images/default-banner.jpg'; // Default image
        let summary = project.description || 'Pas de description.';

        // Prioritize dedicated banner_path
        if (project.banner_path) {
            bannerImage = '/uploads/projects/' + project.banner_path;
        } else if (project.readme_content) {
            // Fallback: Extract first image from README HTML content
            const imageMatch = project.readme_content.match(/<img src="(.*?)"/);
            if (imageMatch && imageMatch[1]) {
                bannerImage = imageMatch[1];
            } else {
                // Try markdown image regex
                const mdImageMatch = project.readme_content.match(/!\[.*?\]\((.*?)\)/);
                if (mdImageMatch && mdImageMatch[1]) {
                    bannerImage = mdImageMatch[1];
                }
            }
        }

        if (project.readme_content) {
            // Create a summary from the first 3 sentences of the README
            const textOnlyReadme = project.readme_content
                .replace(/!\[.*?\]\(.*?\)/g, '')  // Remove Markdown images
                .replace(/<[^>]+>/g, '')         // Strip HTML tags
                .replace(/[#*`~-]/g, '')         // Remove common Markdown characters
                .trim();

            if (textOnlyReadme) {
                const sentences = textOnlyReadme.split('. ').slice(0, 3);
                summary = sentences.join('. ').trim();
                if (summary) {
                    summary += (sentences.length < 3 ? '' : '...');
                }
            }
        }

        // Fallback summary if still empty
        if (!summary || summary.trim() === '...' || summary.trim() === '') {
            summary = project.description || 'Ce projet n\'a pas encore de description.';
        }

        return {
            ...project,
            banner_image: bannerImage,
            summary: summary
        };
    });
};

exports.getAllProjects = async (req, res) => {
    try {
        const projects = await Project.findAllWithAuthors({ is_public: true });
        const processedProjects = processProjects(projects);
        res.render('projects/index', { projects: processedProjects, user: req.session.user, title: 'Projets' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.getMyProjects = async (req, res) => {
    const userId = req.session.user.id;
    try {
        const projects = await Project.findAllWithAuthors({ author_id: userId });
        const processedProjects = processProjects(projects);
        res.render('projects/my-projects', { projects: processedProjects, user: req.session.user, title: 'Mes Projets' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.getNewProjectChoice = (req, res) => {
    res.render('projects/create-project-choice', { user: req.session.user, title: 'Nouveau Projet' });
};

exports.getNewInternalProject = (req, res) => {
    res.render('projects/create-internal', { user: req.session.user, title: 'Nouveau Projet Interne' });
};

exports.createInternalProject = async (req, res) => {
    const { title, readme_content, is_public, allow_download } = req.body;
    const author_id = req.session.user.id;

    const isPublicFinal = is_public === 'on' ? 1 : 0;
    const allowDownloadFinal = allow_download === 'on' ? 1 : 0;
    const bannerPath = req.files['banner'] ? req.files['banner'][0].filename : null;

    try {
        const projectId = await Project.create({
            title, readme_content, banner_path: bannerPath, author_id,
            project_type: 'internal', is_public: isPublicFinal, allow_download: allowDownloadFinal
        });

        // Check badges "Architecte"
        try {
            const count = await Project.countByAuthor(author_id);
            const badges = await db('badges').where({ criteria_type: "projects_count" }).andWhere('criteria_value', '<=', count);
            if (badges) {
                for (const badge of badges) {
                    // Knex .insert().onConflict().ignore() works in newer knex/sqlite
                    // Or separate check.
                    // Simple insert ignore via raw or try/catch unique constraint
                    try {
                        await db('user_badges').insert({ user_id: author_id, badge_id: badge.id });
                    } catch (e) { /* ignore unique constraint */ }
                }
            }
        } catch (badgeErr) {
            console.error("Badge award error:", badgeErr);
        }

        if (req.files['project_files'] && req.files['project_files'].length > 0) {
            const fileInserts = req.files['project_files'].map(file => ({
                project_id: projectId,
                file_name: file.originalname,
                file_path: file.filename
            }));
            await Project.addFile(fileInserts);
        }

        res.redirect('/projects/my-projects');

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur lors de la création du projet.");
    }
};

exports.uploadImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier na été téléversé.' });
    }
    const location = `/uploads/projects/${req.file.filename}`;
    res.json({ location: location });
};

exports.getProject = async (req, res) => {
    const projectId = req.params.id;
    try {
        const project = await Project.findByIdWithAuthor(projectId);
        if (!project) {
            return res.status(404).send("Projet non trouvé");
        }

        // Convert README from Markdown to HTML
        if (project.readme_content) {
            const rawHtml = converter.makeHtml(project.readme_content);
            project.readme_content = sanitizeHtml(rawHtml, {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat([
                    'img', 'h1', 'h2', 'pre', 'code', 'u', 'span'
                ]),
                allowedAttributes: {
                    '*': ['style', 'class'],
                    'a': ['href', 'name', 'target'],
                    'img': ['src', 'alt', 'title', 'width', 'height']
                },
                allowedSchemes: ['http', 'https', 'mailto', 'data']
            });
        }

        project.files = await Project.getFiles(projectId);
        const comments = await Project.getCommentsWithAuthors(projectId);

        const isAuthor = req.session.user && req.session.user.id === project.author_id;
        res.render('projects/view', { project, comments, user: req.session.user, isAuthor, title: project.title });

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.getEditProject = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    try {
        const project = await Project.findById(projectId);
        if (!project || project.author_id !== userId) {
            return res.status(404).send("Projet non trouvé ou vous n'avez pas la permission de le modifier.");
        }

        project.files = await Project.getFiles(projectId);
        res.render('projects/edit-internal', { project, user: req.session.user, title: 'Modifier le Projet Interne' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.updateProject = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    const { title, readme_content, is_public, allow_download } = req.body;

    const isPublicFinal = is_public === 'on' ? 1 : 0;
    const allowDownloadFinal = allow_download === 'on' ? 1 : 0;

    const updates = {
        title,
        readme_content,
        is_public: isPublicFinal,
        allow_download: allowDownloadFinal
    };

    if (req.files['banner']) {
        updates.banner_path = req.files['banner'][0].filename;
    }

    try {
        // Ensure ownership
        const project = await Project.findById(projectId);
        if (!project || project.author_id !== userId) {
            return res.status(403).send("Non autorisé");
        }

        await Project.update(projectId, updates);

        if (req.files['project_files'] && req.files['project_files'].length > 0) {
            const fileInserts = req.files['project_files'].map(file => ({
                project_id: projectId,
                file_name: file.originalname,
                file_path: file.filename
            }));
            await Project.addFile(fileInserts);
        }
        res.redirect('/projects/' + projectId);

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.postComment = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    const { comment } = req.body;

    try {
        await Project.addComment({ project_id: projectId, user_id: userId, comment });
        res.redirect('/projects/' + projectId);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.deleteProjectFile = async (req, res) => {
    const { id, file_id } = req.params;
    const userId = req.session.user.id;

    try {
        const project = await Project.findById(id);
        if (!project || project.author_id !== userId) {
            return res.status(404).send("Non autorisé");
        }

        const file = await Project.getFile(file_id);
        if (!file || file.project_id != id) { // Loose equality for potential string/int mismatch
            return res.status(404).send("Fichier non trouvé");
        }

        const filePath = path.join(uploadDir, file.file_path);
        fs.unlink(filePath, (err) => {
            if (err) console.error("File deletion error:", err);
            // Ignore disk error, proceed to DB
        });

        await Project.deleteFile(file_id);
        res.redirect(`/projects/${id}/edit`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.upvoteProject = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    try {
        const existing = await Project.getUpvote(projectId, userId);
        if (existing) {
            return res.redirect('/projects');
        }
        await Project.addUpvote(projectId, userId);
        res.redirect('/projects/' + projectId);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};

exports.deleteProject = async (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;

    try {
        const project = await Project.findById(projectId);
        if (!project || project.author_id !== userId) {
            return res.status(403).send("Non autorisé");
        }

        const files = await Project.getFiles(projectId);
        files.forEach(file => {
            const filePath = path.join(uploadDir, file.file_path);
            fs.unlink(filePath, (err) => {
                if (err) console.error(err);
            });
        });

        await Project.delete(projectId); // Cascade should handle DB relations
        res.redirect('/projects/my-projects');

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
};
