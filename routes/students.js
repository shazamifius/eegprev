// routes/students.js
const express = require('express');
const router = express.Router();
const { db, knex } = require('../database');
const User = require('../models/User');
const { handleDbError, parsePortfolioLinks } = require('../utils/helpers');

// Routes pour les élèves
router.get('/', async (req, res) => {
    const { search_name, search_class } = req.query;

    try {
        const users = await User.search({ name: search_name, classe: search_class });

        // Enrich with showcase images
        const usersWithShowcases = await Promise.all(users.map(async user => {
            user.showcaseImages = await knex('showcase_images').where({ user_id: user.id }).limit(4);
            return user;
        }));

        const classes = await User.listClasses();

        res.render('students', {
            users: usersWithShowcases,
            user: req.session.user,
            classes: classes,
            search_name: search_name,
            search_class: search_class
        });
    } catch (err) {
        handleDbError(err, res);
    }
});

router.get('/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const user = await User.findById(userId);
        if (!user) {
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

    } catch (err) {
        handleDbError(err, res);
    }
});

module.exports = router;
