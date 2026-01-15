const knex = require('knex');
const config = require('./knexfile');

// Use development config by default or check NODE_ENV
const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

console.log(`Running migrations for ${environment}...`);

db.migrate.latest()
    .then(() => {
        console.log('Batch of migrations run: completed');
        return db.destroy();
    })
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
