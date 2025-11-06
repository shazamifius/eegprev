
const { setupDatabase } = require('./database');

setupDatabase(() => {
    console.log('Database reset');
});
