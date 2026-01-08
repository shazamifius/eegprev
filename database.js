const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Legacy Database Setup
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : './database.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error(err.message);
    else if (process.env.NODE_ENV !== 'test') {
        console.log('Connecté à la base de données SQLite (Legacy).');
    }
});

// Knex Setup
const environment = process.env.NODE_ENV || 'development';
const config = require('./knexfile')[environment];
const knex = require('knex')(config);

const setupDatabase = (callback) => {
    // Legacy support wrapper.
    console.log("Using Hybrid Database Mode (Legacy + Knex).");
    // Run migrations to ensure schema exists (critical for tests using :memory:)
    knex.migrate.latest()
        .then(() => {
            if (callback) callback();
        })
        .catch(err => {
            console.error("Migration failed in setupDatabase:", err);
            if (callback) callback(err);
        });
};

module.exports = { db, knex, setupDatabase };
