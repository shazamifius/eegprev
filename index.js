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
            if (req.path.includes('help')) {
                dest += 'help';
            } else {
                dest += 'news';
            }
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

app.get('/', (req, res) => {
    if (req.session.user) {
        // Logged-in view: Fetch latest news and publications
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

        Promise.all([newsPromise, postsPromise])
            .then(([news, posts]) => {
                res.render('index', { user: req.session.user, news: news, posts: posts });
            })
            .catch(err => handleDbError(err, res));
    } else {
        // Logged-out view: Fetch featured projects, recent posts, and latest news
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
                res.render('index', { user: undefined, projects: projects, posts: posts, news: news });
            })
            .catch(err => handleDbError(err, res));
    }
});

app.get('/login', (req, res) => {
    res.render('login', { user: undefined, error: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return handleDbError(err, res);
        if (!user) return res.redirect('/login');

        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.user = user;
                res.redirect('/profile');
            } else {
                res.redirect('/login');
            }
        });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { user: undefined });
});

app.post('/register', upload.single('avatar'), async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const { name, email, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio } = req.body;
        const avatar = req.file ? '/images/avatars/' + req.file.filename : null;
        db.run('INSERT INTO users (name, email, password, avatar, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, avatar, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio],
            (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/login');
            });
    } catch (err) {
        handleDbError(err, res);
    }
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
            db.all('SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC', [userId], (err, posts) => {
                if (err) return reject(err);
                resolve(posts);
            });
        });

        Promise.all([projectsPromise, showcasePromise, postsPromise])
            .then(([projects, showcaseImages, posts]) => {
                res.render('profile', { user: req.session.user, sessionUser: req.session.user, projects: projects, showcaseImages: showcaseImages, posts: posts });
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

// Routes pour l'aide et l'assistance
app.get('/help', (req, res) => {
    const { category, status } = req.query;
    let query = 'SELECT hr.*, u.name as authorName FROM help_requests hr JOIN users u ON hr.author_id = u.id';
    const params = [];

    if (category || status) {
        query += ' WHERE';
        if (category) {
            query += ' hr.category = ?';
            params.push(category);
        }
        if (status) {
            if (category) query += ' AND';
            query += ' hr.status = ?';
            params.push(status);
        }
    }

    query += ' ORDER BY hr.created_at DESC';

    db.all(query, params, (err, requests) => {
        if (err) return handleDbError(err, res);
        res.render('help', { requests: requests || [], user: req.session.user });
    });
});

app.post('/help/new', (req, res) => {
    if (req.session.user) {
        const { title, description, category } = req.body;
        db.run('INSERT INTO help_requests (title, description, category, author_id) VALUES (?, ?, ?, ?)',
            [title, description, category, req.session.user.id],
            (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/help');
            });
    } else {
        res.redirect('/login');
    }
});

app.get('/help/:id', (req, res) => {
    const requestId = req.params.id;
    db.get('SELECT hr.*, u.name as authorName FROM help_requests hr JOIN users u ON hr.author_id = u.id WHERE hr.id = ?', [requestId], (err, request) => {
        if (err || !request) {
            return res.redirect('/help');
        }
        db.all('SELECT c.*, u.name as authorName, u.avatar as authorAvatar FROM help_request_comments c JOIN users u ON c.author_id = u.id WHERE c.request_id = ? ORDER BY c.created_at ASC', [requestId], (err, comments) => {
            if (err) return handleDbError(err, res);
            res.render('help-detail', { request: request, comments: comments, user: req.session.user });
        });
    });
});

app.post('/help/:id/resolve', (req, res) => {
    if (req.session.user) {
        const requestId = req.params.id;
        db.get('SELECT author_id FROM help_requests WHERE id = ?', [requestId], (err, row) => {
            if (err || !row || row.author_id !== req.session.user.id) {
                return res.redirect('/help');
            }
            db.run('UPDATE help_requests SET status = "résolue" WHERE id = ?', [requestId], (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/help/' + requestId);
            });
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/help/:id/comment', upload.single('image'), (req, res) => {
    if (req.session.user) {
        const requestId = req.params.id;
        const { comment } = req.body;
        const imagePath = req.file ? '/images/help/' + req.file.filename : null;
        db.run('INSERT INTO help_request_comments (content, image_path, author_id, request_id) VALUES (?, ?, ?, ?)',
            [comment, imagePath, req.session.user.id, requestId],
            (err) => {
                if (err) return handleDbError(err, res);
                res.redirect('/help/' + requestId);
            });
    } else {
        res.redirect('/login');
    }
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

app.get('/projects/:id', (req, res) => {
    const projectId = req.params.id;
    db.get('SELECT p.*, u.name as authorName FROM projects p JOIN users u ON p.author_id = u.id WHERE p.id = ?', [projectId], (err, project) => {
        if (err || !project) {
            return res.redirect('/projects');
        }

        db.get('SELECT image_path FROM project_images WHERE project_id = ? AND is_main = 1', [projectId], (err, mainImage) => {
            if (err) return handleDbError(err, res);
            project.main_image = mainImage ? mainImage.image_path : null;

            db.all('SELECT image_path FROM project_images WHERE project_id = ? AND (is_main = 0 OR is_main IS NULL)', [projectId], (err, secondaryImages) => {
                if (err) return handleDbError(err, res);
                project.secondary_images = secondaryImages.map(img => img.image_path);

                db.all('SELECT u.id, u.name FROM users u JOIN project_collaborators pc ON u.id = pc.user_id WHERE pc.project_id = ?', [projectId], (err, collaborators) => {
                    if (err) return handleDbError(err, res);

                    db.all('SELECT * FROM project_files WHERE project_id = ?', [projectId], (err, projectFiles) => {
                        if (err) return handleDbError(err, res);
                        res.render('project-detail', { project: project, collaborators: collaborators, projectFiles: projectFiles, user: req.session.user });
                    });
                });
            });
        });
    });
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
        const { name, classe, age, birthdate, discord, instagram, snapchat, portfolio, bio } = req.body;
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
            db.all('SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC', [userId], (err, posts) => {
                if (err) return reject(err);
                resolve(posts);
            });
        });

        Promise.all([projectsPromise, showcasePromise, postsPromise])
            .then(([projects, showcaseImages, posts]) => {
                res.render('profile', { user: user, sessionUser: req.session.user, projects: projects, showcaseImages: showcaseImages, posts: posts });
            })
            .catch(err => handleDbError(err, res));
    });
});

app.get('/projects', (req, res) => {
    db.all('SELECT p.*, u.name as authorName FROM projects p JOIN users u ON p.author_id = u.id', [], (err, projects) => {
        if (err) return handleDbError(err, res);

        const promises = projects.map(project =>
            new Promise((resolve, reject) => {
                db.get('SELECT image_path FROM project_images WHERE project_id = ? AND is_main = 1', [project.id], (err, mainImage) => {
                    if (err) return reject(err);
                    project.main_image = mainImage ? mainImage.image_path : null;
                    db.all('SELECT image_path FROM project_images WHERE project_id = ? AND (is_main = 0 OR is_main IS NULL)', [project.id], (err, secondaryImages) => {
                        if (err) return reject(err);
                        project.secondary_images = secondaryImages.map(img => img.image_path);
                        resolve(project);
                    });
                });
            })
        );

        Promise.all(promises)
            .then(detailedProjects => {
                res.render('projects', { projects: detailedProjects, user: req.session.user });
            })
            .catch(err => handleDbError(err, res));
    });
});

app.get('/projects/new', (req, res) => {
    if (req.session.user) {
        db.all('SELECT id, name FROM users', [], (err, users) => {
            if (err) return handleDbError(err, res);
            res.render('new-project', { user: req.session.user, users: users });
        });
    } else {
        req.flash('error', 'Vous devez être connecté pour créer un projet.');
        res.redirect('/login');
    }
});

app.post('/projects/new', upload.fields([
    { name: 'main_image', maxCount: 1 },
    { name: 'secondary_images', maxCount: 3 },
    { name: 'project_files', maxCount: 10 }
]), (req, res) => {
    if (req.session.user) {
        const { title, description, readme, collaborators } = req.body;
        db.run('INSERT INTO projects (title, description, readme, author_id) VALUES (?, ?, ?, ?)',
            [title, description, readme, req.session.user.id],
            async function(err) {
                if (err) return handleDbError(err, res);
                const projectId = this.lastID;

                try {
                    const promises = [];

                    if (collaborators) {
                        const collaboratorIds = Array.isArray(collaborators) ? collaborators : [collaborators];
                        collaboratorIds.forEach(userId => {
                            promises.push(new Promise((resolve, reject) => {
                                db.run('INSERT INTO project_collaborators (project_id, user_id) VALUES (?, ?)', [projectId, userId], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }));
                        });
                    }

                    if (req.files && req.files['main_image']) {
                        const imagePath = '/images/projects/' + req.files['main_image'][0].filename;
                        promises.push(new Promise((resolve, reject) => {
                            db.run('INSERT INTO project_images (project_id, image_path, is_main) VALUES (?, ?, 1)', [projectId, imagePath], (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        }));
                    }
                    if (req.files && req.files['secondary_images']) {
                        req.files['secondary_images'].forEach(file => {
                            const imagePath = '/images/projects/' + file.filename;
                            promises.push(new Promise((resolve, reject) => {
                                db.run('INSERT INTO project_images (project_id, image_path, is_main) VALUES (?, ?, 0)', [projectId, imagePath], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }));
                        });
                    }
                    if (req.files && req.files['project_files']) {
                        req.files['project_files'].forEach(file => {
                            const filePath = '/files/projects/' + file.filename;
                            promises.push(new Promise((resolve, reject) => {
                                db.run('INSERT INTO project_files (project_id, file_name, file_path) VALUES (?, ?, ?)', [projectId, file.originalname, filePath], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }));
                        });
                    }

                    await Promise.all(promises);
                    res.redirect('/projects');
                } catch (dbErr) {
                    handleDbError(dbErr, res);
                }
            });
    } else {
        req.flash('error', 'Votre session a expiré. Veuillez vous reconnecter pour créer un projet.');
        res.redirect('/login');
    }
});

app.post('/projects/:id/upvote', (req, res) => {
    if (req.session.user) {
        const projectId = req.params.id;
        const userId = req.session.user.id;
        db.get('SELECT * FROM project_upvotes WHERE user_id = ? AND project_id = ?', [userId, projectId], (err, row) => {
            if (err) return handleDbError(err, res);
            if (row) {
                // L'utilisateur a déjà voté
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
    req.session.destroy();
    res.redirect('/');
});

const connectedUsers = {};

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
    });

    // Gérer les messages du chat
    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    // Gérer la déconnexion d'un utilisateur
    socket.on('disconnect', () => {
        delete connectedUsers[socket.id];
        io.emit('update user list', connectedUsers);
    });
});

if (process.env.NODE_ENV !== 'test') {
    server.listen(port, () => {
        console.log(`Serveur en écoute sur http://localhost:${port}`);
    });
}

module.exports = { app, server };
