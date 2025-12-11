// routes/profile.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { handleDbError, parsePortfolioLinks, calculateAge } = require('../utils/helpers');
const { upload } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Profil utilisateur
router.get('/', (req, res) => {
    if (req.session.user) {
        const userId = req.session.user.id;
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
                const portfolioLinks = parsePortfolioLinks(req.session.user.portfolio);
                res.render('profile', { user: req.session.user, sessionUser: req.session.user, projects: projects, showcaseImages: showcaseImages, posts: posts, portfolioLinks: portfolioLinks, badges: badges });
            })
            .catch(err => handleDbError(err, res));
    } else {
        res.redirect('/login');
    }
});

router.get('/edit', (req, res) => {
    if (req.session.user) {
        db.all('SELECT * FROM showcase_images WHERE user_id = ?', [req.session.user.id], (err, showcaseImages) => {
            if (err) return handleDbError(err, res);
            res.render('edit-profile', { user: req.session.user, showcaseImages: showcaseImages });
        });
    } else {
        res.redirect('/login');
    }
});

router.post('/edit', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'showcase', maxCount: 4 }]), (req, res) => {
    if (req.session.user) {
        const { name, classe, birthdate, discord, instagram, snapchat, portfolio, bio, color_bg, color_text, color_primary, color_secondary } = req.body;
        const age = calculateAge(birthdate);
        let avatar = req.session.user.avatar;
        if (req.files['avatar']) {
            avatar = '/images/avatars/' + req.files['avatar'][0].filename;
        }

        db.run('UPDATE users SET name = ?, classe = ?, age = ?, birthdate = ?, discord = ?, instagram = ?, snapchat = ?, portfolio = ?, bio = ?, avatar = ?, color_bg = ?, color_text = ?, color_primary = ?, color_secondary = ? WHERE id = ?',
            [name, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio, avatar, color_bg, color_text, color_primary, color_secondary, req.session.user.id],
            (err) => {
                if (err) return handleDbError(err, res);
                // Mettre à jour la session
                req.session.user = { ...req.session.user, name, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio, avatar, color_bg, color_text, color_primary, color_secondary };

                if (req.files['showcase']) {
                    req.files['showcase'].forEach(file => {
                        const imagePath = '/images/showcase/' + file.filename;
                        db.run('INSERT INTO showcase_images (user_id, image_path) VALUES (?, ?)', [req.session.user.id, imagePath]);
                    });
                }
                res.redirect('/profile');
            });
    } else {
        res.redirect('/login');
    }
});

router.get('/showcase/delete/:id', (req, res) => {
    if (req.session.user) {
        const imageId = req.params.id;
        db.get('SELECT * FROM showcase_images WHERE id = ? AND user_id = ?', [imageId, req.session.user.id], (err, image) => {
            if (err) return handleDbError(err, res);
            if (image) {
                fs.unlink(path.join(__dirname, '../public', image.image_path), () => { // path correction: public is outside routes/
                    // Ignorer l'erreur si le fichier n'existe pas
                });
                db.run('DELETE FROM showcase_images WHERE id = ?', [imageId], (err) => {
                    if (err) return handleDbError(err, res);
                    res.redirect('/profile/edit');
                });
            } else {
                res.redirect('/profile/edit');
            }
        });
    } else {
        res.redirect('/login');
    }
});

module.exports = router;
