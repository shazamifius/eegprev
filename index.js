const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const fs = require('fs');

const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const db = require('./database');

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
io.engine.use(sessionMiddleware);

// Middleware de gestion d'erreurs
const handleDbError = (err, res) => {
    console.error(err);
    res.status(500).send("Une erreur interne est survenue.");
};

app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/login', (req, res) => {
    res.render('login', { user: undefined });
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
        db.all('SELECT * FROM projects WHERE author_id = ?', [req.session.user.id], (err, projects) => {
            if (err) return handleDbError(err, res);
            db.all('SELECT * FROM showcase_images WHERE user_id = ?', [req.session.user.id], (err, showcaseImages) => {
                if (err) return handleDbError(err, res);
                res.render('profile', { user: req.session.user, sessionUser: req.session.user, projects: projects, showcaseImages: showcaseImages });
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
    db.all('SELECT * FROM users', [], (err, users) => {
        if (err) return handleDbError(err, res);
        res.render('students', { users: users, user: req.session.user });
    });
});

app.get('/students/:id', (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (err || !user) {
            return res.redirect('/students');
        }
        db.all('SELECT * FROM projects WHERE author_id = ?', [req.params.id], (err, projects) => {
            if (err) return handleDbError(err, res);
            db.all('SELECT * FROM showcase_images WHERE user_id = ?', [req.params.id], (err, showcaseImages) => {
                if (err) return handleDbError(err, res);
                res.render('profile', { user: user, sessionUser: req.session.user, projects: projects, showcaseImages: showcaseImages });
            });
        });
    });
});

app.get('/projects', (req, res) => {
    db.all(`
        SELECT p.*, u.name as authorName,
               (SELECT image_path FROM project_images WHERE project_id = p.id AND is_main = 1) as main_image,
               GROUP_CONCAT((SELECT image_path FROM project_images WHERE project_id = p.id AND is_main = 0), ',') as secondary_images
        FROM projects p
        JOIN users u ON p.author_id = u.id
        GROUP BY p.id
    `, [], (err, projects) => {
        if (err) return handleDbError(err, res);
        res.render('projects', { projects: projects, user: req.session.user });
    });
});

app.get('/projects/new', (req, res) => {
    if (req.session.user) {
        res.render('new-project', { user: req.session.user });
    } else {
        res.redirect('/login');
    }
});

app.post('/projects/new', upload.fields([{ name: 'main_image', maxCount: 1 }, { name: 'secondary_images', maxCount: 3 }]), (req, res) => {
    if (req.session.user) {
        const { title, description } = req.body;
        db.run('INSERT INTO projects (title, description, author_id) VALUES (?, ?, ?)',
            [title, description, req.session.user.id],
            function(err) {
                if (err) return handleDbError(err, res);
                const projectId = this.lastID;
                if (req.files['main_image']) {
                    const imagePath = '/images/projects/' + req.files['main_image'][0].filename;
                    db.run('INSERT INTO project_images (project_id, image_path, is_main) VALUES (?, ?, 1)', [projectId, imagePath]);
                }
                if (req.files['secondary_images']) {
                    req.files['secondary_images'].forEach(file => {
                        const imagePath = '/images/projects/' + file.filename;
                        db.run('INSERT INTO project_images (project_id, image_path, is_main) VALUES (?, ?, 0)', [projectId, imagePath]);
                    });
                }
                res.redirect('/projects');
            });
    } else {
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

io.on('connection', (socket) => {
    const session = socket.request.session;
    const user = session.user;

    if (!user) {
        return;
    }

    socket.on('chat message', (msg) => {
        io.emit('chat message', { name: user.name, msg: msg });
    });
});

server.listen(port, () => {
    console.log(`Serveur en écoute sur http://localhost:${port}`);
});
