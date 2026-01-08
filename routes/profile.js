// routes/profile.js
const express = require('express');
const router = express.Router();
const { knex } = require('../database'); // Use knex
const User = require('../models/User');
const Project = require('../models/Project'); // Import Project model
const { handleDbError, parsePortfolioLinks, calculateAge } = require('../utils/helpers');
const { upload } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Profil utilisateur
router.get('/', async (req, res) => {
    if (req.session.user) {
        const userId = req.session.user.id;

        try {
            // Re-fetch user to make sure we have latest data? Or trust session?
            // Usually safest to trust session for ID but fetch fresh data for display if needed.
            // But strict refactor of existing logic:

            // Projects
            // Existing logic had complex image selection. Project.findByAuthor does simple query?
            // Let's check Project.findByAuthor. It returns projects.
            // We might need to manually attach main image if Model doesn't do it.
            // Model findByAuthor joins users but doesn't explicitly join images unless we update it.
            // But let's use the Model and see if we need to enrich it. 
            // The previous code did manual main image fetching.

            // Let's stick to knex for complex queries if Model is too simple, OR use Model if sufficient.
            // Project.findByAuthor currently just gets projects. 
            // Let's doing parallel fetching like before but using Knex.

            const projects = await Project.findByAuthor(userId);
            // Enrich projects with images manually if needed, or assume Project.findByAuthor handles it?
            // Actually Project.findByAuthor in my previous step was:
            // return db('projects').where({ author_id: authorId }).orderBy('created_at', 'desc');
            // It does NOT fetch images.
            // So we need to fetch images.

            const projectsWithImages = await Promise.all(projects.map(async p => {
                const mainImage = await knex('project_images').where({ project_id: p.id, is_main: 1 }).first();
                p.main_image = mainImage ? mainImage.image_path : (p.banner_path ? '/uploads/projects/' + p.banner_path : null);
                return p;
            }));

            const showcaseImages = await knex('showcase_images').where({ user_id: userId });

            const posts = await knex('posts')
                .join('users', 'posts.author_id', 'users.id')
                .select('posts.*', 'users.name as authorName', 'users.avatar as authorAvatar')
                .where('posts.author_id', userId)
                .orderBy('posts.created_at', 'desc');

            const badges = await knex('badges')
                .join('user_badges', 'badges.id', 'user_badges.badge_id')
                .where('user_badges.user_id', userId)
                .select('badges.*');

            const portfolioLinks = parsePortfolioLinks(req.session.user.portfolio);

            res.render('profile', {
                user: req.session.user,
                sessionUser: req.session.user,
                projects: projectsWithImages,
                showcaseImages: showcaseImages,
                posts: posts,
                portfolioLinks: portfolioLinks,
                badges: badges
            });

        } catch (err) {
            handleDbError(err, res);
        }
    } else {
        res.redirect('/login');
    }
});

router.get('/edit', async (req, res) => {
    if (req.session.user) {
        try {
            const showcaseImages = await knex('showcase_images').where({ user_id: req.session.user.id });
            res.render('edit-profile', { user: req.session.user, showcaseImages: showcaseImages });
        } catch (err) {
            handleDbError(err, res);
        }
    } else {
        res.redirect('/login');
    }
});

router.post('/edit', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'showcase', maxCount: 4 }]), async (req, res) => {
    if (req.session.user) {
        const { name, classe, birthdate, discord, instagram, snapchat, portfolio, bio, color_bg, color_text, color_primary, color_secondary } = req.body;
        const age = calculateAge(birthdate);
        let avatar = req.session.user.avatar;

        if (req.files['avatar']) {
            avatar = '/images/avatars/' + req.files['avatar'][0].filename;
        }

        try {
            const updates = {
                name, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio, avatar,
                color_bg, color_text, color_primary, color_secondary
            };

            // Remove undefined keys? Knex update ignores undefined? No, it sets NULL or errors? 
            // Better to clean formatted data? 
            // Actually the body params might be empty strings, which is fine.

            await User.update(req.session.user.id, updates);

            // Update Session
            req.session.user = { ...req.session.user, ...updates };

            if (req.files['showcase']) {
                const showcaseInserts = req.files['showcase'].map(file => ({
                    user_id: req.session.user.id,
                    image_path: '/images/showcase/' + file.filename
                }));
                if (showcaseInserts.length > 0) {
                    await knex('showcase_images').insert(showcaseInserts);
                }
            }

            res.redirect('/profile');

        } catch (err) {
            handleDbError(err, res);
        }
    } else {
        res.redirect('/login');
    }
});

router.get('/showcase/delete/:id', async (req, res) => {
    if (req.session.user) {
        const imageId = req.params.id;
        try {
            const image = await knex('showcase_images').where({ id: imageId, user_id: req.session.user.id }).first();

            if (image) {
                // Determine full path. Note: __dirname is routes/, so ../public is correct.
                // But image_path in DB already starts with /images/...? 
                // Previous code: path.join(__dirname, '../public', image.image_path)
                const fullPath = path.join(__dirname, '../public', image.image_path);

                fs.unlink(fullPath, (err) => {
                    if (err) console.error("File deletion error:", err);
                });

                await knex('showcase_images').where({ id: imageId }).del();
            }
            res.redirect('/profile/edit');

        } catch (err) {
            handleDbError(err, res);
        }
    } else {
        res.redirect('/login');
    }
});

module.exports = router;
