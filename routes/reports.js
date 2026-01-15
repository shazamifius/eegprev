const express = require('express');
const router = express.Router();
const { knex } = require('../database');

// Middleware to ensure user is logged in
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ success: false, message: 'Non autorisé' });
}

// POST /report
router.post('/report', isAuthenticated, async (req, res) => {
    try {
        const { target_type, target_id, reason } = req.body;
        const reporter_id = req.session.user.id;

        if (!target_type || !target_id || !reason) {
            return res.status(400).json({ success: false, message: 'Données manquantes' });
        }

        if (!['user', 'post', 'project', 'help_request'].includes(target_type)) {
            return res.status(400).json({ success: false, message: 'Type de cible invalide' });
        }

        await knex('reports').insert({
            reporter_id,
            target_type,
            target_id,
            reason
        });

        res.json({ success: true, message: 'Signalement envoyé avec succès' });
    } catch (err) {
        console.error('Erreur lors du signalement:', err);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
