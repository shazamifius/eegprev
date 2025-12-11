// routes/home.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { handleDbError } = require('../utils/helpers');
const { isAdmin } = require('../middleware/auth');

router.get('/', (req, res) => {
    // Récupérer le "Daily Prompt" actif
    const dailyPromptPromise = new Promise((resolve) => {
        db.get('SELECT * FROM daily_prompts WHERE active_date = CURRENT_DATE ORDER BY created_at DESC LIMIT 1', [], (err, prompt) => {
            if (err) resolve(null); // Ne pas bloquer si erreur
            else resolve(prompt);
        });
    });

    if (req.session.user) {
        // Refresh session user data from DB to get latest coworking status
        db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id], (err, refreshedUser) => {
            if (!err && refreshedUser) {
                req.session.user = refreshedUser; // Update session
                req.session.save(); // Ensure session is saved
            }

            // Logged-in view
            const newsPromise = new Promise((resolve, reject) => {
                db.all('SELECT * FROM news ORDER BY created_at DESC LIMIT 5', [], (err, news) => {
                    if (err) return reject(err);
                    resolve(news);
                });
            });
            const postsPromise = new Promise((resolve, reject) => {
                db.all('SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT 10', [], (err, posts) => {
                    if (err) return reject(err);
                    resolve(posts);
                });
            });

            Promise.all([newsPromise, postsPromise, dailyPromptPromise])
                .then(([news, posts, dailyPrompt]) => {
                    res.render('index', { user: req.session.user, news: news, posts: posts, dailyPrompt: dailyPrompt });
                })
                .catch(err => handleDbError(err, res));
        });
    } else {
        const projectsPromise = new Promise((resolve, reject) => {
            db.all("SELECT p.*, u.name as authorName, COALESCE((SELECT image_path FROM project_images WHERE project_id = p.id AND is_main = 1), CASE WHEN p.banner_path IS NOT NULL THEN '/uploads/projects/' || p.banner_path ELSE '/images/default-project.png' END) as main_image FROM projects p JOIN users u ON p.author_id = u.id ORDER BY p.upvotes DESC LIMIT 3", [], (err, projects) => {
                if (err) return reject(err);
                resolve(projects);
            });
        });

        const postsPromise = new Promise((resolve, reject) => {
            db.all('SELECT p.*, u.name as authorName FROM posts p JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT 3', [], (err, posts) => {
                if (err) return reject(err);
                resolve(posts);
            });
        });

        const newsPromise = new Promise((resolve, reject) => {
            db.all('SELECT * FROM news ORDER BY created_at DESC LIMIT 1', [], (err, news) => {
                if (err) return reject(err);
                resolve(news);
            });
        });

        Promise.all([projectsPromise, postsPromise, newsPromise])
            .then(([projects, posts, news]) => {
                res.render('index', { user: undefined, projects: projects, posts: posts, news: news, dailyPrompt: null });
            })
            .catch(err => handleDbError(err, res));
    }
});

// Route Admin pour créer un Daily Prompt
router.post('/admin/daily-prompt', isAdmin, (req, res) => {
    const { content } = req.body;
    db.run('INSERT INTO daily_prompts (content) VALUES (?)', [content], (err) => {
        if (err) return handleDbError(err, res);
        res.redirect('/');
    });
});

module.exports = router;
