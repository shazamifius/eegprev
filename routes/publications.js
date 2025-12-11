// routes/publications.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { handleDbError } = require('../utils/helpers');
const { upload } = require('../middleware/upload');

// Routes pour les publications
router.get('/', (req, res) => {
    const filter = req.query.filter;
    let query = 'SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id';
    const params = [];

    if (filter && filter !== 'Tous') {
        query += ' WHERE p.category = ?';
        params.push(filter);
    }

    query += ' ORDER BY p.created_at DESC';

    db.all(query, params, (err, posts) => {
        if (err) return handleDbError(err, res);
        res.render('publications', { posts: posts || [], user: req.session.user });
    });
});

router.post('/new', upload.single('media'), (req, res) => {
    if (req.session.user) {
        const { content, category } = req.body;
        const mediaPath = req.file ? '/images/publications/' + req.file.filename : null;
        const mediaType = req.file ? req.file.mimetype : null;

        db.run('INSERT INTO posts (content, media_path, media_type, category, author_id) VALUES (?, ?, ?, ?, ?)',
            [content, mediaPath, mediaType, category, req.session.user.id],
            (err) => {
                if (err) return handleDbError(err, res);
                // Check badges "Social"
                db.get('SELECT count(*) as count FROM posts WHERE author_id = ?', [req.session.user.id], (err, row) => {
                    if (!err) {
                        db.all('SELECT * FROM badges WHERE criteria_type = "posts_count" AND criteria_value <= ?', [row.count], (err, badges) => {
                            if (!err && badges) {
                                badges.forEach(badge => {
                                    db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)', [req.session.user.id, badge.id]);
                                });
                            }
                        });
                    }
                });
                res.redirect('/publications');
            });
    } else {
        res.redirect('/login');
    }
});

router.get('/:id', (req, res) => {
    const postId = req.params.id;
    db.get('SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?', [postId], (err, post) => {
        if (err || !post) {
            return res.redirect('/publications');
        }
        db.all('SELECT c.*, u.name as authorName, u.avatar as authorAvatar FROM post_comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC', [postId], (err, comments) => {
            if (err) return handleDbError(err, res);
            res.render('publication-detail', { post: post, comments: comments, user: req.session.user });
        });
    });
});

router.post('/:id/comment', (req, res) => {
    if (req.session.user) {
        const postId = req.params.id;
        const { comment } = req.body;
        db.run('INSERT INTO post_comments (post_id, user_id, comment) VALUES (?, ?, ?)',
            [postId, req.session.user.id, comment],
            (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/publications/' + postId);
            });
    } else {
        res.redirect('/login');
    }
});

router.post('/:id/upvote', (req, res) => {
    if (req.session.user) {
        const postId = req.params.id;
        const userId = req.session.user.id;

        db.get('SELECT * FROM post_upvotes WHERE user_id = ? AND post_id = ?', [userId, postId], (err, row) => {
            if (err) return handleDbError(err, res);
            if (row) {
                return res.redirect('/publications');
            }
            db.run('INSERT INTO post_upvotes (user_id, post_id) VALUES (?, ?)', [userId, postId], (err) => {
                if (err) return handleDbError(err, res);
                db.run('UPDATE posts SET upvotes = upvotes + 1 WHERE id = ?', [postId], (err) => {
                    if (err) return handleDbError(err, res);
                    res.redirect('/publications');
                });
            });
        });
    } else {
        res.redirect('/login');
    }
});

module.exports = router;
