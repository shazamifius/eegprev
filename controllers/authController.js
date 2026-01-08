const bcrypt = require('bcrypt');
const multer = require('multer');
const User = require('../models/User');
const { knex: db } = require('../database'); // Still needed for showcase_images manual insert or we should move it to User model too?
// Note: Ideally User.create should handle related data or we create a ShowcaseImage model.
// For strict MVC, we should use models. But for this step, let's mix if needed but prefer Model.
// Actually, let's keep it clean: User model creates user, simple.
// We should probably create ShowcaseImage model too or just direct db for now to save time, 
// but the goal is "Redoutable", so let's use direct db for secondary tables for now if we don't have models yet, 
// or quickly create ShowcaseImage model.
// Optimization: I'll use direct db calls for showcase_images for now to keep the change focused on User Auth, 
// but replacing User logic is key.

const { handleDbError, calculateAge } = require('../utils/helpers');
const { upload } = require('../middleware/upload');

exports.getLogin = (req, res) => {
    res.render('login', { user: undefined, error: req.flash('error') });
};

exports.postLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findByEmail(email);
        if (!user) {
            req.flash('error', 'Aucun utilisateur trouvé avec cet email.');
            return res.redirect('/login');
        }

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = user;
            res.redirect('/profile');
        } else {
            req.flash('error', 'Mot de passe incorrect.');
            res.redirect('/login');
        }
    } catch (err) {
        handleDbError(err, res);
    }
};

exports.getRegister = (req, res) => {
    res.render('register', { user: undefined, error: req.flash('error') });
};

exports.postRegister = (req, res) => {
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

            // Check if user exists (handled by unique constraint usually, but good to check)
            // Knex will throw constraint error which we catch.

            const userData = {
                name, email, password: hashedPassword, avatar, classe, age, birthdate,
                discord, instagram, snapchat, portfolio, bio
            };

            try {
                const userId = await User.create(userData);

                if (req.files['showcase']) {
                    const showcaseInserts = req.files['showcase'].map(file => ({
                        user_id: userId,
                        image_path: '/images/showcase/' + file.filename
                    }));
                    if (showcaseInserts.length > 0) {
                        await db('showcase_images').insert(showcaseInserts);
                    }
                }
                res.redirect('/login');
            } catch (dbErr) {
                // Knex error codes for sqlite: SQLITE_CONSTRAINT, unique violation...
                // Knex usually throws generic Error but with .code property.
                if (dbErr.code === 'SQLITE_CONSTRAINT' && dbErr.message.includes('UNIQUE constraint failed: users.email')) {
                    req.flash('error', 'Cet email est déjà utilisé. Veuillez en choisir un autre.');
                    return res.redirect('/register');
                }
                // Handle Postgres/other DB unique errors if we switch? 
                // For now, check message or code 23505 (postgres).
                // Let's rely on message includes 'email' for safety across drivers if possible, 
                // but strictly for SQLite it's SQLITE_CONSTRAINT.
                throw dbErr;
            }

        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('users.email')) {
                req.flash('error', 'Cet email est déjà utilisé. Veuillez en choisir un autre.');
                return res.redirect('/register');
            }
            handleDbError(err, res);
        }
    });
};

exports.logout = async (req, res) => {
    if (req.session.user) {
        try {
            await User.setCoworkingStatus(req.session.user.id, false);
        } catch (err) {
            console.error("Logout update error:", err);
        }
    }
    req.session.destroy();
    res.redirect('/');
};
