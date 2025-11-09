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
        res.render('projects/index', { projects, user: req.session.user, title: 'Projets' });
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

// GET /projects/new - Display project creation form
router.get('/new', isAuthenticated, (req, res) => {
    res.render('projects/create', { user: req.session.user, title: 'Nouveau Projet' });
});

// POST /projects/new - Handle project creation
router.post('/new', isAuthenticated, upload.array('files', 10), (req, res) => {
    const { title, description, is_public, allow_download } = req.body;
    const author_id = req.session.user.id;
    const isPublic = is_public === 'on' ? 1 : 0;
    const allowDownload = allow_download === 'on' ? 1 : 0;

    db.run('INSERT INTO projects (title, description, author_id, is_public, allow_download) VALUES (?, ?, ?, ?, ?)',
        [title, description, author_id, isPublic, allowDownload], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        const projectId = this.lastID;
        if (req.files) {
            const files = req.files.map(file => ({
                project_id: projectId,
                file_name: file.originalname,
                file_path: file.filename
            }));
            const stmt = db.prepare('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)');
            files.forEach(file => {
                stmt.run(file.project_id, file.file_name, file.file_path);
            });
            stmt.finalize();
        }
        res.redirect('/projects/my-projects');
    });
});

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
        db.all('SELECT * FROM project_files WHERE project_id = ?', [projectId], (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            project.files = files;
            const isAuthor = req.session.user && req.session.user.id === project.author_id;
            res.render('projects/view', { project, user: req.session.user, isAuthor, title: project.title });
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
            res.render('projects/edit', { project, user: req.session.user, title: 'Modifier le Projet' });
        });
    });
});

// POST /projects/:id/edit - Handle project edit
router.post('/:id/edit', isAuthenticated, upload.array('files', 10), (req, res) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, is_public, allow_download } = req.body;
    const isPublic = is_public === 'on' ? 1 : 0;
    const allowDownload = allow_download === 'on' ? 1 : 0;

    db.run('UPDATE projects SET title = ?, description = ?, is_public = ?, allow_download = ? WHERE id = ? AND author_id = ?',
        [title, description, isPublic, allowDownload, projectId, userId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        if (req.files) {
            const files = req.files.map(file => ({
                project_id: projectId,
                file_name: file.originalname,
                file_path: file.filename
            }));
            const stmt = db.prepare('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)');
            files.forEach(file => {
                stmt.run(file.project_id, file.file_name, file.file_path);
            });
            stmt.finalize();
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
