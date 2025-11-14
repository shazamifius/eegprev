const express = require('express');
const router = express.Router();
const { db } = require('../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/projects');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// GET /projects - Public projects gallery
router.get('/', (req, res) => {
    db.all(`
        SELECT projects.*, users.name as author_name
        FROM projects
        JOIN users ON projects.author_id = users.id
        WHERE projects.is_public = 1
        ORDER BY projects.created_at DESC`, (err, projects) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }

        const processedProjects = projects.map(project => {
            let bannerImage = '/images/default-banner.jpg'; // Default image
            let summary = project.description || 'Pas de description.';

            if (project.readme_content) {
                // Extract first image from README
                const imageMatch = project.readme_content.match(/!\[.*?\]\((.*?)\)/);
                if (imageMatch && imageMatch[1]) {
                    bannerImage = imageMatch[1];
                }

                // Create a summary from the first 3 sentences of the README
                // Improved stripping of Markdown and HTML tags, and trimming whitespace
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

        res.render('projects/index', { projects: processedProjects, user: req.session.user, title: 'Projets' });
    });
});

// GET /projects/my-projects - User's own projects
router.get('/my-projects', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    db.all('SELECT * FROM projects WHERE author_id = ? ORDER BY created_at DESC', [userId], (err, projects) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        res.render('projects/my-projects', { projects, user: req.session.user, title: 'Mes Projets' });
    });
});

// GET /projects/new - Display project creation choice page
router.get('/new', isAuthenticated, (req, res) => {
    res.render('projects/create-project-choice', { user: req.session.user, title: 'Nouveau Projet' });
});

// GET /projects/new/internal - Display internal project creation form
router.get('/new/internal', isAuthenticated, (req, res) => {
    res.render('projects/create-internal', { user: req.session.user, title: 'Nouveau Projet Interne' });
});

// GET /projects/new/github - Display GitHub project creation form
router.get('/new/github', isAuthenticated, (req, res) => {
    res.render('projects/create-github', { user: req.session.user, title: 'Lier un Dépôt GitHub' });
});

// POST /projects/new/internal - Handle internal project creation
router.post('/new/internal', isAuthenticated, upload.array('project_files', 10), (req, res) => {
    const { title, readme_content, is_public, allow_download } = req.body;
    const author_id = req.session.user.id;

    const isPublicFinal = is_public === 'on' ? 1 : 0;
    const allowDownloadFinal = allow_download === 'on' ? 1 : 0;

    db.run(`INSERT INTO projects (title, readme_content, author_id, project_type, is_public, allow_download)
            VALUES (?, ?, ?, 'internal', ?, ?)`,
        [title, readme_content, author_id, isPublicFinal, allowDownloadFinal], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur lors de la création du projet.");
        }
        const projectId = this.lastID;
        if (req.files && req.files.length > 0) {
            const stmt = db.prepare('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)');
            req.files.forEach(file => {
                stmt.run(projectId, file.originalname, file.filename, (err) => {
                    if (err) {
                        console.error("Erreur lors de l'insertion du fichier :", err);
                    }
                });
            });
            stmt.finalize((err) => {
                if(err) {
                    console.error("Erreur lors de la finalisation de l'insertion des fichiers :", err);
                }
                res.redirect('/projects/my-projects');
            });
        } else {
            res.redirect('/projects/my-projects');
        }
    });
});

// POST /projects/new/github - Handle GitHub project linking
const axios = require('axios');

router.post('/new/github', isAuthenticated, async (req, res) => {
    const { github_url, is_public, allow_download } = req.body;
    const author_id = req.session.user.id;
    const githubApiUrl = github_url.replace('github.com', 'api.github.com/repos');

    try {
        const repoResponse = await axios.get(githubApiUrl);
        const readmeResponse = await axios.get(`${githubApiUrl}/readme`);

        const title = repoResponse.data.name;
        const description = repoResponse.data.description;
        const readmeContent = Buffer.from(readmeResponse.data.content, 'base64').toString('utf-8');

        const isPublicFinal = is_public === 'on' ? 1 : 0;
        const allowDownloadFinal = allow_download === 'on' ? 1 : 0;

        db.run(`INSERT INTO projects (title, description, readme_content, author_id, project_type, github_url, is_public, allow_download)
                VALUES (?, ?, ?, ?, 'github', ?, ?, ?)`,
            [title, description, readmeContent, author_id, github_url, isPublicFinal, allowDownloadFinal], function(err) {
            if (err) {
                console.error(err);
                return res.render('projects/create-github', { user: req.session.user, title: 'Lier un Dépôt GitHub', error: 'Erreur lors de la sauvegarde du projet.' });
            }
            res.redirect('/projects/my-projects');
        });

    } catch (error) {
        console.error(error);
        let errorMessage = "Erreur lors de la récupération des informations du dépôt GitHub. Assurez-vous que l'URL est correcte et que le dépôt est public.";
        if (error.response && error.response.status === 404) {
            errorMessage = "Dépôt non trouvé. Veuillez vérifier l'URL.";
        }
        res.render('projects/create-github', { user: req.session.user, title: 'Lier un Dépôt GitHub', error: errorMessage });
    }
});

const showdown = require('showdown');
const converter = new showdown.Converter();

// GET /projects/:id - Display a single project
router.get('/:id', (req, res) => {
    const projectId = req.params.id;
    db.get(`
        SELECT projects.*, users.name as author_name
        FROM projects
        JOIN users ON projects.author_id = users.id
        WHERE projects.id = ?`, [projectId], (err, project) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        if (!project) {
            return res.status(404).send("Projet non trouvé");
        }

        // Convert README from Markdown to HTML
        if (project.readme_content) {
            project.readme_content = converter.makeHtml(project.readme_content);
        }

        db.all('SELECT * FROM project_files WHERE project_id = ?', [projectId], (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            project.files = files;

            db.all('SELECT pc.*, u.name as author_name, u.avatar as author_avatar FROM project_comments pc JOIN users u ON pc.user_id = u.id WHERE pc.project_id = ? ORDER BY pc.created_at DESC', [projectId], (err, comments) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Erreur serveur");
                }
                const isAuthor = req.session.user && req.session.user.id === project.author_id;
                res.render('projects/view', { project, comments, user: req.session.user, isAuthor, title: project.title });
            });
        });
    });
});

// GET /projects/:id/edit - Display project edit form
router.get('/:id/edit', isAuthenticated, (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    db.get('SELECT * FROM projects WHERE id = ? AND author_id = ?', [projectId, userId], (err, project) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        if (!project) {
            return res.status(404).send("Projet non trouvé ou vous n'avez pas la permission de le modifier.");
        }

        if (project.project_type === 'github') {
            res.render('projects/edit-github', { project, user: req.session.user, title: 'Modifier le Projet GitHub' });
        } else {
            db.all('SELECT * FROM project_files WHERE project_id = ?', [projectId], (err, files) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Erreur serveur");
                }
                project.files = files;
                res.render('projects/edit-internal', { project, user: req.session.user, title: 'Modifier le Projet Interne' });
            });
        }
    });
});

// POST /projects/:id/edit - Handle project edit
router.post('/:id/edit', isAuthenticated, upload.array('project_files', 10), (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    const { project_type, title, readme_content, is_public, allow_download } = req.body;

    const isPublicFinal = is_public === 'on' ? 1 : 0;
    const allowDownloadFinal = allow_download === 'on' ? 1 : 0;

    if (project_type === 'github') {
        // GitHub projects: only update visibility settings
        db.run('UPDATE projects SET is_public = ?, allow_download = ? WHERE id = ? AND author_id = ?',
            [isPublicFinal, allowDownloadFinal, projectId, userId], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            res.redirect('/projects/' + projectId);
        });
    } else {
        // Internal projects: update content and visibility
        db.run('UPDATE projects SET title = ?, readme_content = ?, is_public = ?, allow_download = ? WHERE id = ? AND author_id = ?',
            [title, readme_content, isPublicFinal, allowDownloadFinal, projectId, userId], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }

            // Handle new file uploads
            if (req.files && req.files.length > 0) {
                const stmt = db.prepare('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)');
                req.files.forEach(file => {
                    stmt.run(projectId, file.originalname, file.filename);
                });
                stmt.finalize();
            }
            res.redirect('/projects/' + projectId);
        });
    }
});

// POST /projects/:id/comment - Handle new comment
router.post('/:id/comment', isAuthenticated, (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    const { comment } = req.body;

    db.run('INSERT INTO project_comments (project_id, user_id, comment) VALUES (?, ?, ?)',
        [projectId, userId, comment], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        res.redirect('/projects/' + projectId);
    });
});

// GET /projects/:id/files/:file_id/delete - Handle file deletion
router.get('/:id/files/:file_id/delete', isAuthenticated, (req, res) => {
    const { id, file_id } = req.params;
    const userId = req.session.user.id;

    db.get('SELECT * FROM projects WHERE id = ? AND author_id = ?', [id, userId], (err, project) => {
        if (err || !project) {
            return res.status(404).send("Projet non trouvé ou vous n'avez pas la permission de le modifier.");
        }

        db.get('SELECT * FROM project_files WHERE id = ? AND project_id = ?', [file_id, id], (err, file) => {
            if (err || !file) {
                return res.status(404).send("Fichier non trouvé.");
            }

            const filePath = path.join(uploadDir, file.file_path);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Erreur lors de la suppression du fichier.");
                }

                db.run('DELETE FROM project_files WHERE id = ?', [file_id], (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Erreur serveur");
                    }
                    res.redirect(`/projects/${id}/edit`);
                });
            });
        });
    });
});

// POST /projects/:id/delete - Handle project deletion
router.post('/:id/delete', isAuthenticated, (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;

    db.all('SELECT * FROM project_files WHERE project_id = ?', [projectId], (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }

        files.forEach(file => {
            const filePath = path.join(uploadDir, file.file_path);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(err);
                }
            });
        });

        db.run('DELETE FROM projects WHERE id = ? AND author_id = ?', [projectId, userId], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            res.redirect('/projects/my-projects');
        });
    });
});


module.exports = router;
