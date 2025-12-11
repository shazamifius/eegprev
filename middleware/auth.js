// middleware/auth.js
const { db } = require('../database');

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.is_admin) {
        next();
    } else {
        res.redirect('/');
    }
};

const refreshSessionUser = (req, res, next) => {
    if (req.session.user) {
        db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id], (err, refreshedUser) => {
            if (!err && refreshedUser) {
                // Update properties from DB
                req.session.user = refreshedUser;
                // Force save not strictly necessary if we modify the object in place and store uses it,
                // but explicit save handles some store edge cases.
                req.session.save((err) => {
                    if (err) console.error("Session save error:", err);
                    next();
                });
            } else {
                next();
            }
        });
    } else {
        next();
    }
};

module.exports = {
    isAdmin,
    refreshSessionUser
};
