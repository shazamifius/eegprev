// middleware/auth.js
const User = require('../models/User');

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.is_admin) {
        next();
    } else {
        res.redirect('/');
    }
};

const refreshSessionUser = async (req, res, next) => {
    if (req.session.user) {
        try {
            const refreshedUser = await User.findById(req.session.user.id);
            if (refreshedUser) {
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
        } catch (err) {
            console.error("Session refresh error:", err);
            next();
        }
    } else {
        next();
    }
};

module.exports = {
    isAdmin,
    refreshSessionUser
};
