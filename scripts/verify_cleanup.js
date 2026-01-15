const knex = require('knex');
const knexConfig = require('../knexfile');
const fs = require('fs');
const path = require('path');

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

async function verify() {
    console.log('Verifying cleanup...');

    const tables = [
        'projects', 'posts', 'messages', 'help_requests',
        'project_files', 'showcase_images', 'users'
    ];

    for (const table of tables) {
        const count = await db(table).count('id as c').first();
        console.log(`${table}: ${count.c} rows`);
    }

    const uploadsDir = path.join(__dirname, '../public/uploads');
    if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        console.log(`files in uploads: ${files.length} (should be 0 or small number of ignored files)`);
    } else {
        console.log('uploads dir does not exist');
    }

    await db.destroy();
}

verify();
