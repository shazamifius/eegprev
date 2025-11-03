const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connecté à la base de données SQLite.');
});

const setupDatabase = () => {
    db.serialize(() => {
        // Table des utilisateurs
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            classe TEXT,
            age INTEGER,
            birthdate TEXT,
            discord TEXT,
            instagram TEXT,
            snapchat TEXT,
            portfolio TEXT,
            bio TEXT,
            avatar TEXT
        )`);

        // Table des projets
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            author_id INTEGER,
            upvotes INTEGER DEFAULT 0,
            FOREIGN KEY (author_id) REFERENCES users (id)
        )`);

        // Table des images showcase
        db.run(`CREATE TABLE IF NOT EXISTS showcase_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            image_path TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Table des images de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            image_path TEXT NOT NULL,
            is_main BOOLEAN,
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )`);

        // Table des votes de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_upvotes (
            user_id INTEGER,
            project_id INTEGER,
            PRIMARY KEY (user_id, project_id),
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (project_id) REFERENCES projects (id)
        )`);
    });
};

setupDatabase();

module.exports = db;
