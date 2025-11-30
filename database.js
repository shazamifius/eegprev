const sqlite3 = require('sqlite3').verbose();
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : './database.db';
const bcrypt = require('bcrypt');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error(err.message);
    }
    if (process.env.NODE_ENV !== 'test') {
        console.log('Connecté à la base de données SQLite.');
    }
});

const createSchema = (callback) => {
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
            avatar TEXT,
            is_admin BOOLEAN DEFAULT 0,
            is_coworking BOOLEAN DEFAULT 0,
            coworking_room TEXT,
            coworking_activity TEXT
        )`, () => {
             // Migration pour ajouter les colonnes coworking si elles n'existent pas
             db.all("PRAGMA table_info(users)", (err, columns) => {
                if (!err) {
                    const hasIsCoworking = columns.some(col => col.name === 'is_coworking');
                    if (!hasIsCoworking) {
                        db.run("ALTER TABLE users ADD COLUMN is_coworking BOOLEAN DEFAULT 0");
                        db.run("ALTER TABLE users ADD COLUMN coworking_room TEXT");
                        db.run("ALTER TABLE users ADD COLUMN coworking_activity TEXT", (err) => {
                             if(err) console.error("Erreur migration users coworking:", err);
                             else console.log("Migration: Colonnes coworking ajoutées à users.");
                        });
                    }
                }
            });
        });

        // Table des projets
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            readme_content TEXT,
            banner_path TEXT,
            author_id INTEGER,
            project_type TEXT NOT NULL DEFAULT 'internal',
            github_url TEXT,
            is_public BOOLEAN DEFAULT 0,
            allow_download BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            upvotes INTEGER DEFAULT 0,
            FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
        )`, () => {
            // Migration pour ajouter la colonne banner_path si elle n'existe pas (pour les installations existantes)
            db.all("PRAGMA table_info(projects)", (err, columns) => {
                if (!err) {
                    const hasBannerPath = columns.some(col => col.name === 'banner_path');
                    if (!hasBannerPath) {
                        db.run("ALTER TABLE projects ADD COLUMN banner_path TEXT", (err) => {
                            if (err) console.error("Erreur migration banner_path:", err);
                            else console.log("Migration: Colonne banner_path ajoutée.");
                        });
                    }
                }
            });
        });

        // Table des images showcase
        db.run(`CREATE TABLE IF NOT EXISTS showcase_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            image_path TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Table des images de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            image_path TEXT NOT NULL,
            is_main BOOLEAN,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )`);

        // Table des votes de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_upvotes (
            user_id INTEGER,
            project_id INTEGER,
            PRIMARY KEY (user_id, project_id),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )`);

        // Table des publications (posts)
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            media_path TEXT,
            media_type TEXT,
            category TEXT,
            author_id INTEGER,
            upvotes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Table des votes de publication
        db.run(`CREATE TABLE IF NOT EXISTS post_upvotes (
            user_id INTEGER,
            post_id INTEGER,
            PRIMARY KEY (user_id, post_id),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
        )`);

        // Table des actualités (news)
        db.run(`CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image_path TEXT,
            video_url TEXT,
            author_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Table des demandes d'aide
        db.run(`CREATE TABLE IF NOT EXISTS help_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT DEFAULT 'ouverte',
            author_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_anonymous BOOLEAN DEFAULT 0,
            request_type TEXT DEFAULT 'help',
            tags TEXT,
            FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
        )`, () => {
             // Migration pour ajouter les colonnes help_requests si elles n'existent pas
             db.all("PRAGMA table_info(help_requests)", (err, columns) => {
                if (!err) {
                    const hasIsAnonymous = columns.some(col => col.name === 'is_anonymous');
                    if (!hasIsAnonymous) {
                        db.run("ALTER TABLE help_requests ADD COLUMN is_anonymous BOOLEAN DEFAULT 0");
                        db.run("ALTER TABLE help_requests ADD COLUMN request_type TEXT DEFAULT 'help'");
                        db.run("ALTER TABLE help_requests ADD COLUMN tags TEXT", (err) => {
                             if(err) console.error("Erreur migration help_requests:", err);
                             else console.log("Migration: Colonnes ajoutées à help_requests.");
                        });
                    }
                }
            });
        });

        // Table des commentaires sur les demandes d'aide
        db.run(`CREATE TABLE IF NOT EXISTS help_request_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            image_path TEXT,
            author_id INTEGER,
            request_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (request_id) REFERENCES help_requests (id) ON DELETE CASCADE
        )`);

        // Table des commentaires de publication
        db.run(`CREATE TABLE IF NOT EXISTS post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            user_id INTEGER,
            comment TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Table des collaborateurs de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_collaborators (
            project_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Table des commentaires de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            user_id INTEGER,
            comment TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Table des fichiers de projet
        db.run(`CREATE TABLE IF NOT EXISTS project_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )`);

        // Table des badges
        db.run(`CREATE TABLE IF NOT EXISTS badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            criteria_type TEXT,
            criteria_value INTEGER
        )`, () => {
            // Seed badges if empty
            db.get("SELECT count(*) as count FROM badges", (err, row) => {
                if (!err && row.count === 0) {
                     db.run("INSERT INTO badges (name, description, icon, criteria_type, criteria_value) VALUES (?, ?, ?, ?, ?)", ["Mentor", "A aidé 5 personnes", "fa-user-graduate", "help_resolved", 5]);
                     db.run("INSERT INTO badges (name, description, icon, criteria_type, criteria_value) VALUES (?, ?, ?, ?, ?)", ["Architecte", "A publié 3 projets", "fa-drafting-compass", "projects_count", 3]);
                     db.run("INSERT INTO badges (name, description, icon, criteria_type, criteria_value) VALUES (?, ?, ?, ?, ?)", ["Social", "A posté 10 publications", "fa-comments", "posts_count", 10]);
                }
            });
        });

        // Table des badges utilisateurs
        db.run(`CREATE TABLE IF NOT EXISTS user_badges (
            user_id INTEGER,
            badge_id INTEGER,
            awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, badge_id),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (badge_id) REFERENCES badges (id) ON DELETE CASCADE
        )`);

        // Table des sujets du jour (Daily Prompts)
        db.run(`CREATE TABLE IF NOT EXISTS daily_prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            active_date DATE DEFAULT CURRENT_DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, callback);

    });
}

const setupDatabase = (callback) => {
    const tables = [
        'user_badges',
        'badges',
        'daily_prompts',
        'project_files',
        'project_comments',
        'project_collaborators',
        'post_comments',
        'help_request_comments',
        'help_requests',
        'news',
        'post_upvotes',
        'posts',
        'project_upvotes',
        'project_images',
        'showcase_images',
        'projects',
        'users',
    ];

    db.serialize(() => {
        // Drop tables in reverse order of creation to respect foreign key constraints
        tables.forEach(table => {
            db.run(`DROP TABLE IF EXISTS ${table}`);
        });
        createSchema(callback);
    });
};

if (process.env.NODE_ENV !== 'test') {
    createSchema();
}

module.exports = { db, setupDatabase };
