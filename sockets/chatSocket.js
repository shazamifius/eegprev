const { db, knex } = require('../database');

module.exports = (io) => {
    // Chat Namespace or Global Logic (we use global mainly as per existing setup)

    io.on('connection', (socket) => {
        // --- CHAT LOGIC ---

        // Join Chat Event (Optional explicit join, or just global)
        socket.on('join chat', () => {
            // Send recent history
            knex('messages')
                .orderBy('created_at', 'desc')
                .limit(50)
                .then(rows => {
                    // Send in chronological order
                    socket.emit('chat history', rows.reverse());
                })
                .catch(err => {
                    console.error("Error fetching chat history:", err);
                });
        });

        // Handle new message
        socket.on('chat message', (data) => {
            // data matches: { name, avatar, msg, userId (preferably) }

            // Validate
            if (!data.msg || !data.msg.trim()) return;

            // Save to DB
            const message = {
                content: data.msg,
                author_id: data.author_id || 0, // 0 or null if unknown, but better to pass it
                author_name: data.name,
                author_avatar: data.avatar,
                created_at: new Date()
            };

            knex('messages').insert(message)
                .then(() => {
                    // Start simplified, then maybe fetch back ID
                    // Broadcast to ALL users including sender
                    io.emit('chat message', message);
                })
                .catch(err => {
                    console.error("Error saving message:", err);
                });
        });
    });
};
