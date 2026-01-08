const { db } = require('../database');

const rooms = require('../config/rooms');

module.exports = (io) => {
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
                    // Validate if the room still exists
                    const roomExists = rooms.find(r => r.id === row.coworking_room) || rooms.find(r => r.name === row.coworking_room);

                    if (roomExists) {
                        coworkers[user.id] = {
                            id: user.id,
                            name: user.name,
                            avatar: user.avatar,
                            room: roomExists.id, // Ensure we use ID internally
                            activity: row.coworking_activity
                        };
                    } else {
                        // Reset if room invalid
                        db.run('UPDATE users SET is_coworking = 0 WHERE id = ?', [user.id]);
                    }

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
            // data = { is_coworking: boolean, room: string (id), activity: string }

            if (data.is_coworking) {
                // Check time constraints
                const now = new Date();
                const currentHour = now.getHours();

                // Constraint: Can't start before 06:00
                if (currentHour < 6) {
                    socket.emit('coworking error', "Le Workspace n'ouvre qu'à 06h00.");
                    return;
                }

                // Constraint: Can't start after 23:59 (Auto-close handles existing, this prevents new)
                if (currentHour >= 24) {
                    socket.emit('coworking error', "Le Workspace est fermé.");
                    return;
                }

                // Validate Room
                const validRoom = rooms.find(r => r.id === data.room);
                if (!validRoom) {
                    socket.emit('coworking error', "Salle invalide.");
                    return;
                }

                coworkers[user.id] = {
                    id: user.id,
                    name: user.name,
                    avatar: user.avatar,
                    room: validRoom.id,
                    activity: data.activity || 'Travail'
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

        // Gérer les messages du chat - MOVED TO chatSocket.js
        // socket.on('chat message', (data) => {
        //    io.emit('chat message', data);
        // });

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
};
