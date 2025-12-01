const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const fs = require('fs');
const path = require('path');

// Créer les dossiers d'upload s'ils n'existent pas
const uploadDirs = [
    './public/images/avatars',
    './public/images/showcase',
    './public/images/projects',
    './public/files/projects',
    './public/images/publications',
    './public/images/news',
    './public/images/help'
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { db } = require('./database');
const projectsRouter = require('./routes/projects');
const helpRouter = require('./routes/help');

const port = 3000;

// Configuration de Multer pour le stockage des images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let dest = './public/images/';
        if (file.fieldname === "avatar") {
            dest += 'avatars';
        } else if (file.fieldname === "showcase") {
            dest += 'showcase';
        } else if (file.fieldname === "main_image" || file.fieldname === "secondary_images") {
            dest += 'projects';
        } else if (file.fieldname === "project_files") {
            dest = './public/files/projects';
        } else if (file.fieldname === "media") {
            dest += 'publications';
        } else if (file.fieldname === "image") {
            dest += 'news';
        }
        cb(null, dest);
    },
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'une-super-clé-secrète-pour-le-développement',
    resave: false,
    saveUninitialized: true
});
app.use(sessionMiddleware);
app.use(flash());
io.engine.use(sessionMiddleware);

// Middleware de gestion d'erreurs
const handleDbError = (err, res) => {
    console.error(err);
    res.status(500).send("Une erreur interne est survenue.");
};

// Middleware pour vérifier si l'utilisateur est admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.is_admin) {
        next();
    } else {
        res.redirect('/');
    }
};

const calculateAge = (birthdate) => {
    if (!birthdate) return null;
    const [day, month, year] = birthdate.split('/');
    const birthDateObj = new Date(`${year}-${month}-${day}`);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const m = today.getMonth() - birthDateObj.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
        age--;
    }
    return age;
};

const parsePortfolioLinks = (portfolioString) => {
    if (!portfolioString) {
        return [];
    }
    const urls = portfolioString.split(/[\n\r]+/).filter(line => line.trim() !== '');
    return urls.map(url => {
        try {
            // Ensure URL has a protocol
            let fullUrl = url;
            if (!/^https?:\/\//i.test(url)) {
                fullUrl = 'https://' + url;
            }
            const urlObject = new URL(fullUrl);
            let domain = urlObject.hostname.replace('www.', '');
            const name = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
            const icon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            return {
                url: fullUrl,
                name: name,
                icon: icon
            };
        } catch (e) {
            return null;
        }
    }).filter(item => item !== null);
};

// --- ROUTES ---

app.use('/projects', projectsRouter);
app.use('/help', helpRouter);

app.get('/', (req, res) => {
    // Récupérer le "Daily Prompt" actif
    const dailyPromptPromise = new Promise((resolve, reject) => {
        db.get('SELECT * FROM daily_prompts WHERE active_date = CURRENT_DATE ORDER BY created_at DESC LIMIT 1', [], (err, prompt) => {
            if (err) resolve(null); // Ne pas bloquer si erreur
            else resolve(prompt);
        });
    });

    if (req.session.user) {
        // Refresh session user data from DB to get latest coworking status
        db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id], (err, refreshedUser) => {
            if (!err && refreshedUser) {
                req.session.user = refreshedUser; // Update session
                req.session.save(); // Ensure session is saved
            }

            // Logged-in view
            const newsPromise = new Promise((resolve, reject) => {
                db.all('SELECT * FROM news ORDER BY created_at DESC LIMIT 5', [], (err, news) => {
                    if (err) return reject(err);
                    resolve(news);
                });
            });
            const postsPromise = new Promise((resolve, reject) => {
                db.all('SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT 10', [], (err, posts) => {
                    if (err) return reject(err);
                    resolve(posts);
                });
            });

            Promise.all([newsPromise, postsPromise, dailyPromptPromise])
                .then(([news, posts, dailyPrompt]) => {
                    res.render('index', { user: req.session.user, news: news, posts: posts, dailyPrompt: dailyPrompt });
                })
                .catch(err => handleDbError(err, res));
        });
    } else {
        // Logged-out view
        const projectsPromise = new Promise((resolve, reject) => {
            db.all('SELECT p.*, u.name as authorName, (SELECT image_path FROM project_images WHERE project_id = p.id AND is_main = 1) as main_image FROM projects p JOIN users u ON p.author_id = u.id ORDER BY p.upvotes DESC LIMIT 3', [], (err, projects) => {
                if (err) return reject(err);
                resolve(projects);
            });
        });

        const postsPromise = new Promise((resolve, reject) => {
            db.all('SELECT p.*, u.name as authorName FROM posts p JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT 3', [], (err, posts) => {
                if (err) return reject(err);
                resolve(posts);
            });
        });

        const newsPromise = new Promise((resolve, reject) => {
            db.all('SELECT * FROM news ORDER BY created_at DESC LIMIT 1', [], (err, news) => {
                if (err) return reject(err);
                resolve(news);
            });
        });

        Promise.all([projectsPromise, postsPromise, newsPromise])
            .then(([projects, posts, news]) => {
                res.render('index', { user: undefined, projects: projects, posts: posts, news: news, dailyPrompt: null });
            })
            .catch(err => handleDbError(err, res));
    }
});

// Route Admin pour créer un Daily Prompt
app.post('/admin/daily-prompt', isAdmin, (req, res) => {
    const { content } = req.body;
    db.run('INSERT INTO daily_prompts (content) VALUES (?)', [content], (err) => {
        if (err) return handleDbError(err, res);
        res.redirect('/');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { user: undefined, error: req.flash('error') });
});

app.post('/login', (req, res) => {
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

app.get('/register', (req, res) => {
    res.render('register', { user: undefined, error: req.flash('error') });
});

app.post('/register', (req, res) => {
    const uploader = upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'showcase', maxCount: 15 }]);

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
                function(err) {
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

app.get('/profile', (req, res) => {
    if (req.session.user) {
        const userId = req.session.user.id;
        const projectsPromise = new Promise((resolve, reject) => {
            db.all('SELECT * FROM projects WHERE author_id = ?', [userId], (err, projects) => {
                if (err) return reject(err);

                const detailedProjects = projects.map(project =>
                    new Promise((resolveProject, rejectProject) => {
                        db.get('SELECT image_path FROM project_images WHERE project_id = ? AND is_main = 1', [project.id], (err, mainImage) => {
                            if (err) return rejectProject(err);
                            project.main_image = mainImage ? mainImage.image_path : null;
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

app.get('/publications/:id', (req, res) => {
    const postId = req.params.id;
    db.get('SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?', [postId], (err, post) => {
        if (err || !post) {
            return res.redirect('/publications');
        }
        db.all('SELECT c.*, u.name as authorName, u.avatar as authorAvatar FROM post_comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC', [postId], (err, comments) => {
            if (err) return handleDbError(err, res);
            res.render('publication-detail', { post: post, comments: comments, user: req.session.user });
        });
    });
});

app.post('/publications/:id/comment', (req, res) => {
    if (req.session.user) {
        const postId = req.params.id;
        const { comment } = req.body;
        db.run('INSERT INTO post_comments (post_id, user_id, comment) VALUES (?, ?, ?)',
            [postId, req.session.user.id, comment],
            (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/publications/' + postId);
            });
    } else {
        res.redirect('/login');
    }
});

// Routes pour les actualités
app.get('/news', (req, res) => {
    db.all('SELECT * FROM news ORDER BY created_at DESC', [], (err, news) => {
        if (err) return handleDbError(err, res);
        res.render('news', { news: news, user: req.session.user });
    });
});

app.get('/news/new', isAdmin, (req, res) => {
    res.render('new-news', { user: req.session.user });
});

app.post('/news/new', isAdmin, upload.single('image'), (req, res) => {
    const { title, content, video_url } = req.body;
    const imagePath = req.file ? '/images/news/' + req.file.filename : null;
    db.run('INSERT INTO news (title, content, image_path, video_url, author_id) VALUES (?, ?, ?, ?, ?)',
        [title, content, imagePath, video_url, req.session.user.id],
        (err) => {
            if (err) return handleDbError(err, res);
            res.redirect('/news');
        });
});

app.get('/news/edit/:id', isAdmin, (req, res) => {
    const newsId = req.params.id;
    db.get('SELECT * FROM news WHERE id = ?', [newsId], (err, article) => {
        if (err || !article) {
            return res.redirect('/news');
        }
        res.render('edit-news', { article: article, user: req.session.user });
    });
});

app.post('/news/edit/:id', isAdmin, upload.single('image'), (req, res) => {
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

app.post('/news/delete/:id', isAdmin, (req, res) => {
    const newsId = req.params.id;
    db.run('DELETE FROM news WHERE id = ?', [newsId], (err) => {
        if (err) return handleDbError(err, res);
        res.redirect('/news');
    });
});


// Routes pour les publications
app.get('/publications', (req, res) => {
    const filter = req.query.filter;
    let query = 'SELECT p.*, u.name as authorName, u.avatar as authorAvatar FROM posts p JOIN users u ON p.author_id = u.id';
    const params = [];

    if (filter && filter !== 'Tous') {
        query += ' WHERE p.category = ?';
        params.push(filter);
    }

    query += ' ORDER BY p.created_at DESC';

    db.all(query, params, (err, posts) => {
        if (err) return handleDbError(err, res);
        res.render('publications', { posts: posts || [], user: req.session.user });
    });
});

app.post('/publications/new', upload.single('media'), (req, res) => {
    if (req.session.user) {
        const { content, category } = req.body;
        const mediaPath = req.file ? '/images/publications/' + req.file.filename : null;
        const mediaType = req.file ? req.file.mimetype : null;

        db.run('INSERT INTO posts (content, media_path, media_type, category, author_id) VALUES (?, ?, ?, ?, ?)',
            [content, mediaPath, mediaType, category, req.session.user.id],
            (err) => {
                if (err) return handleDbError(err, res);
                // Check badges "Social"
                db.get('SELECT count(*) as count FROM posts WHERE author_id = ?', [req.session.user.id], (err, row) => {
                    if (!err) {
                        db.all('SELECT * FROM badges WHERE criteria_type = "posts_count" AND criteria_value <= ?', [row.count], (err, badges) => {
                            if (!err && badges) {
                                badges.forEach(badge => {
                                    db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)', [req.session.user.id, badge.id]);
                                });
                            }
                        });
                    }
                });
                res.redirect('/publications');
            });
    } else {
        res.redirect('/login');
    }
});

app.post('/publications/:id/upvote', (req, res) => {
    if (req.session.user) {
        const postId = req.params.id;
        const userId = req.session.user.id;

        db.get('SELECT * FROM post_upvotes WHERE user_id = ? AND post_id = ?', [userId, postId], (err, row) => {
            if (err) return handleDbError(err, res);
            if (row) {
                return res.redirect('/publications');
            }
            db.run('INSERT INTO post_upvotes (user_id, post_id) VALUES (?, ?)', [userId, postId], (err) => {
                if (err) return handleDbError(err, res);
                db.run('UPDATE posts SET upvotes = upvotes + 1 WHERE id = ?', [postId], (err) => {
                    if (err) return handleDbError(err, res);
                    res.redirect('/publications');
                });
            });
        });
    } else {
        res.redirect('/login');
    }
});


app.get('/profile/edit', (req, res) => {
    if (req.session.user) {
        db.all('SELECT * FROM showcase_images WHERE user_id = ?', [req.session.user.id], (err, showcaseImages) => {
            if (err) return handleDbError(err, res);
            res.render('edit-profile', { user: req.session.user, showcaseImages: showcaseImages });
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/profile/edit', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'showcase', maxCount: 4 }]), (req, res) => {
    if (req.session.user) {
        const { name, classe, birthdate, discord, instagram, snapchat, portfolio, bio } = req.body;
        const age = calculateAge(birthdate);
        let avatar = req.session.user.avatar;
        if (req.files['avatar']) {
            avatar = '/images/avatars/' + req.files['avatar'][0].filename;
        }

        db.run('UPDATE users SET name = ?, classe = ?, age = ?, birthdate = ?, discord = ?, instagram = ?, snapchat = ?, portfolio = ?, bio = ?, avatar = ? WHERE id = ?',
            [name, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio, avatar, req.session.user.id],
            function(err) {
                if (err) return handleDbError(err, res);
                req.session.user = { ...req.session.user, name, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio, avatar };

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

app.get('/profile/showcase/delete/:id', (req, res) => {
    if (req.session.user) {
        const imageId = req.params.id;
        db.get('SELECT * FROM showcase_images WHERE id = ? AND user_id = ?', [imageId, req.session.user.id], (err, image) => {
            if (err) return handleDbError(err, res);
            if (image) {
                fs.unlink(path.join(__dirname, 'public', image.image_path), (err) => {
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


app.get('/students', (req, res) => {
    const { search_name, search_class } = req.query;
    let query = 'SELECT id, name, email, classe, bio, avatar FROM users';
    const params = [];

    let conditions = [];
    if (search_name) {
        conditions.push('name LIKE ?');
        params.push(`%${search_name}%`);
    }
    if (search_class) {
        conditions.push('classe = ?');
        params.push(search_class);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    db.all(query, params, (err, users) => {
        if (err) return handleDbError(err, res);

        const promises = users.map(user =>
            new Promise((resolve, reject) => {
                db.all('SELECT image_path FROM showcase_images WHERE user_id = ? LIMIT 4', [user.id], (err, images) => {
                    if (err) return reject(err);
                    user.showcaseImages = images;
                    resolve(user);
                });
            })
        );

        Promise.all(promises)
            .then(usersWithShowcases => {
                db.all('SELECT DISTINCT classe FROM users WHERE classe IS NOT NULL ORDER BY classe', [], (err, classes) => {
                    if (err) return handleDbError(err, res);
                    res.render('students', {
                        users: usersWithShowcases,
                        user: req.session.user,
                        classes: classes.map(c => c.classe),
                        search_name: search_name,
                        search_class: search_class
                    });
                });
            })
            .catch(err => handleDbError(err, res));
    });
});

app.get('/students/:id', (req, res) => {
    const userId = req.params.id;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.redirect('/students');
        }

        const projectsPromise = new Promise((resolve, reject) => {
            db.all('SELECT * FROM projects WHERE author_id = ?', [userId], (err, projects) => {
                if (err) return reject(err);

                const detailedProjects = projects.map(project =>
                    new Promise((resolveProject, rejectProject) => {
                        db.get('SELECT image_path FROM project_images WHERE project_id = ? AND is_main = 1', [project.id], (err, mainImage) => {
                            if (err) return rejectProject(err);
                            project.main_image = mainImage ? mainImage.image_path : null;
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
    });
});


app.post('/projects/:id/upvote', (req, res) => {
    if (req.session.user) {
        const projectId = req.params.id;
        const userId = req.session.user.id;
        db.get('SELECT * FROM project_upvotes WHERE user_id = ? AND project_id = ?', [userId, projectId], (err, row) => {
            if (err) return handleDbError(err, res);
            if (row) {
                return res.redirect('/projects');
            }
            db.run('INSERT INTO project_upvotes (user_id, project_id) VALUES (?, ?)', [userId, projectId], (err) => {
                if (err) return handleDbError(err, res);
                db.run('UPDATE projects SET upvotes = upvotes + 1 WHERE id = ?', [projectId], (err) => {
                    if (err) return handleDbError(err, res);
                    res.redirect('/projects');
                });
            });
        });
    } else {
        res.redirect('/login');
    }
});

app.get('/chat', (req, res) => {
    if (req.session.user) {
        res.render('chat', { user: req.session.user });
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    if (req.session.user) {
         // Reset coworking status on logout
         db.run('UPDATE users SET is_coworking = 0 WHERE id = ?', [req.session.user.id]);
    }
    req.session.destroy();
    res.redirect('/');
});


// Socket.IO Logic
const connectedUsers = {};
const coworkers = {}; // { userId: { name, avatar, room, activity } }

io.on('connection', (socket) => {
    const session = socket.request.session;
    const user = session.user;

    if (!user) {
        return;
    }

    // Gérer la connexion d'un nouvel utilisateur
    socket.on('user connected', (connectedUser) => {
        connectedUsers[socket.id] = connectedUser;
        io.emit('update user list', connectedUsers);

        // Check if user is already coworking in DB (Persistence)
        db.get('SELECT is_coworking, coworking_room, coworking_activity FROM users WHERE id = ?', [user.id], (err, row) => {
            if (!err && row && row.is_coworking) {
                coworkers[user.id] = {
                    id: user.id,
                    name: user.name,
                    avatar: user.avatar,
                    room: row.coworking_room,
                    activity: row.coworking_activity
                };
                // Broadcast update to ensure everyone sees the re-connected user
                io.emit('update coworkers list', Object.values(coworkers));
            } else {
                // Send current coworkers list to new user even if they aren't coworking
                socket.emit('update coworkers list', Object.values(coworkers));
            }
        });
    });

    // Gestion du Beacon Coworking
    socket.on('coworking update', (data) => {
        // data = { is_coworking: boolean, room: string, activity: string }

        if (data.is_coworking) {
            // Check time constraints
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            // Constraint: Can't start before 08:16
            if (currentHour < 8 || (currentHour === 8 && currentMinute < 16)) {
                socket.emit('coworking error', "Le Workspace n'ouvre qu'à 8h16.");
                return;
            }

            // Constraint: Can't start after 18:30 (Auto-close handles existing, this prevents new)
            if (currentHour > 18 || (currentHour === 18 && currentMinute >= 30)) {
                socket.emit('coworking error', "Le Workspace ferme à 18h30.");
                return;
            }

            coworkers[user.id] = {
                id: user.id,
                name: user.name,
                avatar: user.avatar,
                room: data.room,
                activity: data.activity
            };

            const startTime = new Date().toISOString();

            db.run('UPDATE users SET is_coworking = 1, coworking_room = ?, coworking_activity = ?, coworking_start_time = ? WHERE id = ?',
                [data.room, data.activity, startTime, user.id]);

        } else {
            delete coworkers[user.id];
            db.run('UPDATE users SET is_coworking = 0 WHERE id = ?', [user.id]);
        }

        // Broadcast full list to everyone
        io.emit('update coworkers list', Object.values(coworkers));
    });

    // Gérer les messages du chat
    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    // Gérer la déconnexion d'un utilisateur
    socket.on('disconnect', () => {
        delete connectedUsers[socket.id];
        // Persistence: Do NOT remove from coworkers on disconnect.
        // User remains "live" until they explicitly turn it off or timeout occurs.
        io.emit('update user list', connectedUsers);
    });
});

// Background task to clean up old coworking sessions
setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check global close time (18:30)
    if (currentHour > 18 || (currentHour === 18 && currentMinute >= 30)) {
        // Close all sessions
        if (Object.keys(coworkers).length > 0) {
            for (const userId in coworkers) {
                delete coworkers[userId];
            }
            db.run('UPDATE users SET is_coworking = 0');
            io.emit('update coworkers list', []);
        }
        return;
    }

    // Check individual timeouts (2 hours)
    db.all('SELECT id, coworking_start_time FROM users WHERE is_coworking = 1', [], (err, rows) => {
        if (!err && rows) {
            let changed = false;
            rows.forEach(row => {
                if (row.coworking_start_time) {
                    const startTime = new Date(row.coworking_start_time);
                    const diffMs = now - startTime;
                    const diffHours = diffMs / (1000 * 60 * 60);

                    if (diffHours >= 2) {
                        delete coworkers[row.id];
                        db.run('UPDATE users SET is_coworking = 0 WHERE id = ?', [row.id]);
                        changed = true;
                    }
                }
            });

            if (changed) {
                io.emit('update coworkers list', Object.values(coworkers));
            }
        }
    });
}, 60 * 1000); // Run every minute

if (process.env.NODE_ENV !== 'test') {
    server.listen(port, () => {
        console.log(`Serveur en écoute sur http://localhost:${port}`);
    });
}

module.exports = { app, server };
