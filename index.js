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
// const { db } = require('./database'); // Not directly used here anymore
const projectsRouter = require('./routes/projects');
const helpRouter = require('./routes/help');
const authRouter = require('./routes/auth');
const homeRouter = require('./routes/home');
const newsRouter = require('./routes/news');
const profileRouter = require('./routes/profile');
const publicationsRouter = require('./routes/publications');
const studentsRouter = require('./routes/students');
const { refreshSessionUser } = require('./middleware/auth');


const port = 3000;

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

// Middleware de gestion d'erreurs (placeholder from original)

// Middleware pour vérifier si l'utilisateur est admin (placeholder from original)

// Middleware pour rafraîchir les données de session utilisateur depuis la BDD
app.use(refreshSessionUser);


// --- ROUTES ---

app.use('/', authRouter);
app.use('/', homeRouter);
app.use('/news', newsRouter);
app.use('/profile', profileRouter);
app.use('/publications', publicationsRouter);
app.use('/students', studentsRouter);
app.use('/projects', projectsRouter);
app.use('/help', helpRouter);


// Chat view route - keep simple view routes here or move to a controller/route?
// It was inline:
app.get('/chat', (req, res) => {
    if (req.session.user) {
        res.render('chat', { user: req.session.user });
    } else {
        res.redirect('/login');
    }
});
// Logout was moved to authRouter/authController

// Socket.IO Logic
require('./sockets/coworkingSocket')(io);
require('./sockets/chatSocket')(io);

if (process.env.NODE_ENV !== 'test') {
    server.listen(port, () => {
        console.log(`Serveur en écoute sur http://localhost:${port}`);
    });
}

module.exports = { app, server };
