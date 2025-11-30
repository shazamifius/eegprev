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

// POST /projects/new/internal - Handle internal project creation
router.post('/new/internal', isAuthenticated, upload.fields([{ name: 'banner', maxCount: 1 }, { name: 'project_files', maxCount: 10 }]), (req, res) => {
    const { title, readme_content, is_public, allow_download } = req.body;
    const author_id = req.session.user.id;

    const isPublicFinal = is_public === 'on' ? 1 : 0;
    const allowDownloadFinal = allow_download === 'on' ? 1 : 0;
    const bannerPath = req.files['banner'] ? req.files['banner'][0].filename : null;

    db.run(`INSERT INTO projects (title, readme_content, banner_path, author_id, project_type, is_public, allow_download)
            VALUES (?, ?, ?, ?, 'internal', ?, ?)`,
        [title, readme_content, bannerPath, author_id, isPublicFinal, allowDownloadFinal], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur lors de la création du projet.");
        }
        const projectId = this.lastID;
        if (req.files['project_files'] && req.files['project_files'].length > 0) {
            const stmt = db.prepare('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)');
            req.files['project_files'].forEach(file => {
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

// POST /projects/upload-image - Handle image uploads from TinyMCE
router.post('/upload-image', isAuthenticated, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier na été téléversé.' });
    }
    // The file is uploaded to the /uploads/projects directory.
    // TinyMCE expects a JSON response with a `location` key.
    const location = `/uploads/projects/${req.file.filename}`;
    res.json({ location: location });
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

        db.all('SELECT * FROM project_files WHERE project_id = ?', [projectId], (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            project.files = files;
            res.render('projects/edit-internal', { project, user: req.session.user, title: 'Modifier le Projet Interne' });
        });
    });
});

// POST /projects/:id/edit - Handle project edit
router.post('/:id/edit', isAuthenticated, upload.fields([{ name: 'banner', maxCount: 1 }, { name: 'project_files', maxCount: 10 }]), (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    const { title, readme_content, is_public, allow_download } = req.body;

    const isPublicFinal = is_public === 'on' ? 1 : 0;
    const allowDownloadFinal = allow_download === 'on' ? 1 : 0;

    let updateQuery = 'UPDATE projects SET title = ?, readme_content = ?, is_public = ?, allow_download = ?';
    let params = [title, readme_content, isPublicFinal, allowDownloadFinal];

    if (req.files['banner']) {
        updateQuery += ', banner_path = ?';
        params.push(req.files['banner'][0].filename);
    }

    updateQuery += ' WHERE id = ? AND author_id = ?';
    params.push(projectId, userId);

    db.run(updateQuery, params, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }

        // Handle new file uploads
        if (req.files['project_files'] && req.files['project_files'].length > 0) {
            const stmt = db.prepare('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)');
            req.files['project_files'].forEach(file => {
                stmt.run(projectId, file.originalname, file.filename);
            });
            stmt.finalize();
        }
        res.redirect('/projects/' + projectId);
    });
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
