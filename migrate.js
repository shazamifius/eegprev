const { knex } = require('./database');

console.log('Running migrations via app database connection...');
knex.migrate.latest()
    .then(() => {
        console.log('Migrations completed successfully.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
