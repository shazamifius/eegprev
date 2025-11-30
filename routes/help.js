const express = require('express');
const router = express.Router();
const { db } = require('../database');
const multer = require('multer');
const path = require('path');

// Configuration Multer pour les images d'aide
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/images/help');
    },
    filename: function(req, file, cb){
        cb(null, 'help-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware d'authentification
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Fonction pour vérifier et attribuer les badges
const checkBadges = (userId) => {
    // Vérifier badge "Mentor" (Aide résolue)
    db.get('SELECT count(*) as count FROM help_requests WHERE author_id = ? AND status = "résolue"', [userId], (err, row) => {
        if (!err) {
             const count = row.count;
             db.all('SELECT * FROM badges WHERE criteria_type = "help_resolved" AND criteria_value <= ?', [count], (err, badges) => {
                 if (!err && badges) {
                     badges.forEach(badge => {
                         db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)', [userId, badge.id]);
                     });
                 }
             });
        }
    });
};

// GET /help - Liste des demandes et skill swaps
router.get('/', (req, res) => {
    const { category, status, type, tag } = req.query;
    let query = `
        SELECT hr.*,
        CASE WHEN hr.is_anonymous = 1 THEN 'Anonyme' ELSE u.name END as authorName,
        CASE WHEN hr.is_anonymous = 1 THEN '/images/default-avatar.png' ELSE u.avatar END as authorAvatar,
        u.id as real_author_id
        FROM help_requests hr
        JOIN users u ON hr.author_id = u.id
    `;

    const params = [];
    const conditions = [];

    if (category) {
        conditions.push('hr.category = ?');
        params.push(category);
    }
    if (status) {
        conditions.push('hr.status = ?');
        params.push(status);
    }
    if (type) {
        conditions.push('hr.request_type = ?');
        params.push(type);
    }
    if (tag) {
        conditions.push('hr.tags LIKE ?');
        params.push(`%${tag}%`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY hr.created_at DESC';

    db.all(query, params, (err, requests) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur serveur");
        }
        res.render('help', {
            requests: requests || [],
            user: req.session.user,
            filters: req.query,
            title: 'Entraide & Collaboration'
        });
    });
});

// POST /help/new - Créer une nouvelle demande
router.post('/new', isAuthenticated, (req, res) => {
    const { title, description, category, is_anonymous, request_type, tags } = req.body;
    const isAnonymousInt = is_anonymous === 'on' ? 1 : 0;

    db.run('INSERT INTO help_requests (title, description, category, author_id, is_anonymous, request_type, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [title, description, category, req.session.user.id, isAnonymousInt, request_type || 'help', tags],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur lors de la création de la demande.");
            }
            res.redirect('/help');
        });
});

// GET /help/:id - Détail d'une demande
router.get('/:id', (req, res) => {
    const requestId = req.params.id;
    db.get(`
        SELECT hr.*,
        CASE WHEN hr.is_anonymous = 1 THEN 'Anonyme' ELSE u.name END as authorName,
        CASE WHEN hr.is_anonymous = 1 THEN '/images/default-avatar.png' ELSE u.avatar END as authorAvatar,
        u.id as real_author_id
        FROM help_requests hr
        JOIN users u ON hr.author_id = u.id
        WHERE hr.id = ?`, [requestId], (err, request) => {
        if (err || !request) {
            return res.redirect('/help');
        }
        db.all('SELECT c.*, u.name as authorName, u.avatar as authorAvatar FROM help_request_comments c JOIN users u ON c.author_id = u.id WHERE c.request_id = ? ORDER BY c.created_at ASC', [requestId], (err, comments) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }

            // Permettre à l'auteur réel (même si anonyme) ou à l'admin de voir les options d'édition
            const canEdit = req.session.user && (req.session.user.id === request.real_author_id || req.session.user.is_admin);

            res.render('help-detail', {
                request: request,
                comments: comments,
                user: req.session.user,
                canEdit: canEdit,
                title: request.title
            });
        });
    });
});

// POST /help/:id/resolve - Marquer comme résolu
router.post('/:id/resolve', isAuthenticated, (req, res) => {
    const requestId = req.params.id;
    db.get('SELECT author_id FROM help_requests WHERE id = ?', [requestId], (err, row) => {
        if (err || !row || (row.author_id !== req.session.user.id && !req.session.user.is_admin)) {
            return res.redirect('/help');
        }
        db.run('UPDATE help_requests SET status = "résolue" WHERE id = ?', [requestId], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            // Check badges for the author (Logic: solving one's own problem doesn't count for Mentor usually,
            // but here we are marking it resolved. Maybe the badge logic should be when YOU comment on someone else's resolved post?
            // For simplicity in this iteration, let's just keep the "I resolved X requests" logic if the intent was "I helped X people".
            // Wait, usually "Mentor" means I helped OTHERS.
            // Current DB schema links resolution to the request itself.
            // Let's assume for now "Mentor" badge is awarded if you have many resolved requests (you are active).
            // OR we could count how many times your comment was selected as answer (feature not present).
            // Let's stick to the prompt's simplicity: "Badge Mentor (si X demandes d'aide résolues)". This usually means "I solved my problems".
            // If the prompt meant "I helped others", we'd need a "Accepted Answer" feature.
            // Let's stick to simple interpretation: User has X resolved tickets -> they are a pro problem solver.
            checkBadges(req.session.user.id);
            res.redirect('/help/' + requestId);
        });
    });
});

// POST /help/:id/comment - Ajouter un commentaire
router.post('/:id/comment', isAuthenticated, upload.single('image'), (req, res) => {
    const requestId = req.params.id;
    const { comment } = req.body;
    const imagePath = req.file ? '/images/help/' + req.file.filename : null;

    db.run('INSERT INTO help_request_comments (content, image_path, author_id, request_id) VALUES (?, ?, ?, ?)',
        [comment, imagePath, req.session.user.id, requestId],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Erreur serveur");
            }
            res.redirect('/help/' + requestId);
        });
});

module.exports = router;
