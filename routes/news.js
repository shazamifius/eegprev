// routes/news.js
const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { handleDbError } = require('../utils/helpers');
const { isAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Routes pour les actualités
router.get('/', (req, res) => {
    db.all('SELECT * FROM news ORDER BY created_at DESC', [], (err, news) => {
        if (err) return handleDbError(err, res);
        res.render('news', { news: news, user: req.session.user });
    });
});

router.get('/new', isAdmin, (req, res) => {
    res.render('new-news', { user: req.session.user });
});

router.post('/new', isAdmin, upload.single('image'), (req, res) => {
    const { title, content, video_url } = req.body;
    const imagePath = req.file ? '/images/news/' + req.file.filename : null;
    db.run('INSERT INTO news (title, content, image_path, video_url, author_id) VALUES (?, ?, ?, ?, ?)',
        [title, content, imagePath, video_url, req.session.user.id],
        (err) => {
            if (err) return handleDbError(err, res);
            res.redirect('/news');
        });
});

router.get('/edit/:id', isAdmin, (req, res) => {
    const newsId = req.params.id;
    db.get('SELECT * FROM news WHERE id = ?', [newsId], (err, article) => {
        if (err || !article) {
            return res.redirect('/news');
        }
        res.render('edit-news', { article: article, user: req.session.user });
    });
});

router.post('/edit/:id', isAdmin, upload.single('image'), (req, res) => {
    const newsId = req.params.id;
    const { title, content, video_url } = req.body;
    let imagePath;

    db.get('SELECT image_path FROM news WHERE id = ?', [newsId], (err, row) => {
        if (err) return handleDbError(err, res);
        imagePath = req.file ? '/images/news/' + req.file.filename : row.image_path;

        db.run('UPDATE news SET title = ?, content = ?, image_path = ?, video_url = ? WHERE id = ?',
            [title, content, imagePath, video_url, newsId],
            (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/news');
            });
    });
});

router.post('/delete/:id', isAdmin, (req, res) => {
    const newsId = req.params.id;
    db.run('DELETE FROM news WHERE id = ?', [newsId], (err) => {
        if (err) return handleDbError(err, res);
        res.redirect('/news');
    });
});

module.exports = router;
