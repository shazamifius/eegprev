// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const { db } = require('../database');
const { handleDbError, calculateAge } = require('../utils/helpers');
const { upload } = require('../middleware/upload');

router.get('/login', (req, res) => {
    res.render('login', { user: undefined, error: req.flash('error') });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return handleDbError(err, res);
        if (!user) {
            req.flash('error', 'Aucun utilisateur trouvé avec cet email.');
            return res.redirect('/login');
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.user = user;
                res.redirect('/profile');
            } else {
                req.flash('error', 'Mot de passe incorrect.');
                res.redirect('/login');
            }
        });
    });
});

router.get('/register', (req, res) => {
    res.render('register', { user: undefined, error: req.flash('error') });
});

router.post('/register', (req, res) => {
    const uploader = upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'showcase', maxCount: 20 }]);

    uploader(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            let message = "Une erreur est survenue lors du téléversement.";
            if (err.code === 'LIMIT_FILE_SIZE') {
                message = "Un des fichiers est trop volumineux.";
            } else if (err.code === 'LIMIT_FILE_COUNT') {
                message = "Vous avez envoyé trop de fichiers.";
            }
            req.flash('error', message);
            return res.redirect('/register');
        } else if (err) {
            req.flash('error', "Une erreur inconnue est survenue lors du téléversement.");
            return res.redirect('/register');
        }

        try {
            const hashedPassword = await bcrypt.hash(req.body.password, 10);
            const { name, email, classe, birthdate, discord, instagram, snapchat, portfolio, bio } = req.body;
            const age = calculateAge(birthdate);
            const avatar = req.files['avatar'] ? '/images/avatars/' + req.files['avatar'][0].filename : null;

            db.run('INSERT INTO users (name, email, password, avatar, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [name, email, hashedPassword, avatar, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio],
                function (err) {
                    if (err) {
                        if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('UNIQUE constraint failed: users.email')) {
                            req.flash('error', 'Cet email est déjà utilisé. Veuillez en choisir un autre.');
                            return res.redirect('/register');
                        }
                        return handleDbError(err, res);
                    }
                    const userId = this.lastID;
                    if (req.files['showcase']) {
                        req.files['showcase'].forEach(file => {
                            const imagePath = '/images/showcase/' + file.filename;
                            db.run('INSERT INTO showcase_images (user_id, image_path) VALUES (?, ?)', [userId, imagePath]);
                        });
                    }
                    res.redirect('/login');
                });
        } catch (err) {
            handleDbError(err, res);
        }
    });
});

router.get('/logout', (req, res) => {
    if (req.session.user) {
        // Reset coworking status on logout
        db.run('UPDATE users SET is_coworking = 0 WHERE id = ?', [req.session.user.id]);
    }
    req.session.destroy();
    res.redirect('/');
});


module.exports = router;
