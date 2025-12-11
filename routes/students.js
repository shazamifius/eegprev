// routes/students.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { handleDbError, parsePortfolioLinks } = require('../utils/helpers');

// Routes pour les élèves
router.get('/', (req, res) => {
    const { search_name, search_class } = req.query;
    let query = 'SELECT id, name, email, classe, bio, avatar FROM users';
    const params = [];

    let conditions = [];
    if (search_name) {
        conditions.push('name LIKE ?');
        params.push(`%${search_name}%`);
    }
    if (search_class) {
        conditions.push('classe = ?');
        params.push(search_class);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    db.all(query, params, (err, users) => {
        if (err) return handleDbError(err, res);

        const promises = users.map(user =>
            new Promise((resolve, reject) => {
                db.all('SELECT image_path FROM showcase_images WHERE user_id = ? LIMIT 4', [user.id], (err, images) => {
                    if (err) return reject(err);
                    user.showcaseImages = images;
                    resolve(user);
                });
            })
        );

        Promise.all(promises)
            .then(usersWithShowcases => {
                db.all('SELECT DISTINCT classe FROM users WHERE classe IS NOT NULL ORDER BY classe', [], (err, classes) => {
                    if (err) return handleDbError(err, res);
                    res.render('students', {
                        users: usersWithShowcases,
                        user: req.session.user,
                        classes: classes.map(c => c.classe),
                        search_name: search_name,
                        search_class: search_class
                    });
                });
            })
            .catch(err => handleDbError(err, res));
    });
});

router.get('/:id', (req, res) => {
    const userId = req.params.id;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.redirect('/students');
        }

        const projectsPromise = new Promise((resolve, reject) => {
            db.all('SELECT * FROM projects WHERE author_id = ?', [userId], (err, projects) => {
                if (err) return reject(err);

                const detailedProjects = projects.map(project =>
                    new Promise((resolveProject, rejectProject) => {
                        db.get('SELECT image_path FROM project_images WHERE project_id = ? AND is_main = 1', [project.id], (err, mainImage) => {
                            if (err) return rejectProject(err);
                            project.main_image = mainImage ? mainImage.image_path : (project.banner_path ? '/uploads/projects/' + project.banner_path : null);
                            resolveProject(project);
                        });
                    })
                );
                Promise.all(detailedProjects).then(resolve).catch(reject);
            });
        });
        const showcasePromise = new Promise((resolve, reject) => {
            db.all('SELECT * FROM showcase_images WHERE user_id = ?', [userId], (err, images) => {
                if (err) return reject(err);
                resolve(images);
            });
        });
        const postsPromise = new Promise((resolve, reject) => {
            db.all('SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.author_id = ? ORDER BY p.created_at DESC', [userId], (err, posts) => {
                if (err) return reject(err);
                resolve(posts);
            });
        });
        const badgesPromise = new Promise((resolve, reject) => {
            db.all('SELECT b.* FROM badges b JOIN user_badges ub ON b.id = ub.badge_id WHERE ub.user_id = ?', [userId], (err, badges) => {
                if (err) return reject(err);
                resolve(badges);
            });
        });

        Promise.all([projectsPromise, showcasePromise, postsPromise, badgesPromise])
            .then(([projects, showcaseImages, posts, badges]) => {
                const portfolioLinks = parsePortfolioLinks(user.portfolio);
                res.render('profile', { user: user, sessionUser: req.session.user, projects: projects, showcaseImages: showcaseImages, posts: posts, portfolioLinks: portfolioLinks, badges: badges });
            })
            .catch(err => handleDbError(err, res));
    });
});

module.exports = router;
