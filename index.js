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
const { db } = require('./database');
const projectsRouter = require('./routes/projects');
const helpRouter = require('./routes/help');
const authRouter = require('./routes/auth');
const homeRouter = require('./routes/home');
const newsRouter = require('./routes/news');
const profileRouter = require('./routes/profile');
const publicationsRouter = require('./routes/publications');
const studentsRouter = require('./routes/students');
const { calculateAge, parsePortfolioLinks, handleDbError } = require('./utils/helpers');
const { isAdmin, refreshSessionUser } = require('./middleware/auth');
const { upload } = require('./middleware/upload');

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

// Middleware de gestion d'erreurs


// Middleware pour vérifier si l'utilisateur est admin


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







// Routes pour les actualités



// Routes pour les publications


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

            // Constraint: Can't start before 06:00
            if (currentHour < 6) {
                socket.emit('coworking error', "Le Workspace n'ouvre qu'à 06h00.");
                return;
            }

            // Constraint: Can't start after 23:59 (Auto-close handles existing, this prevents new)
            // Removed strict 18:30 limit as requested
            if (currentHour >= 24) {
                socket.emit('coworking error', "Le Workspace est fermé.");
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

    // Check global close time (02:00 AM instead of 18:30 for example, or simply reset at midnight)
    // Relaxed to practically always open
    if (currentHour === 4 && currentMinute === 0) { // Reset at 4 AM
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
