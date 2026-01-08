// routes/home.js
const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');
const { isAdmin } = require('../middleware/auth');

router.get('/', homeController.getHome);

// Route Admin pour créer un Daily Prompt
router.post('/admin/daily-prompt', isAdmin, homeController.createDailyPrompt);

module.exports = router;
