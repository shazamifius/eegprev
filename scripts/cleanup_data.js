const fs = require('fs');
const path = require('path');
const knex = require('knex');
const knexConfig = require('../knexfile');

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

const UPLOADS_DIR = path.join(__dirname, '../public/uploads');

async function cleanupData() {
    console.log('Starting data cleanup...');

    try {
        // 1. Database Cleanup
        console.log('Cleaning database tables...');

        // Disable foreign key checks for SQLite to allow cleaning in any order (or we do it in correct order)
        // With cascading deletes, we might just delete from main tables, but explicit is safer to be sure.
        await db.raw('PRAGMA foreign_keys = OFF');

        await db('reports').del();
        await db('messages').del();
        await db('user_badges').del();
        await db('project_files').del();
        await db('project_comments').del();
        await db('project_collaborators').del();
        await db('post_comments').del();
        await db('help_request_comments').del();
        await db('help_requests').del();
        await db('news').del(); // Assuming news can be cleared too or re-seeded
        await db('post_upvotes').del();
        await db('posts').del();
        await db('project_upvotes').del();
        await db('project_images').del();
        await db('showcase_images').del();
        await db('projects').del();
        await db('users').del();

        await db.raw('PRAGMA foreign_keys = ON');
        console.log('Database tables cleaned.');

        // 2. File Cleanup
        console.log('Cleaning file directories...');
        const directoriesToClean = [
            path.join(__dirname, '../public/images/avatars'),
            path.join(__dirname, '../public/images/showcase'),
            path.join(__dirname, '../public/images/projects'),
            path.join(__dirname, '../public/images/publications'),
            path.join(__dirname, '../public/images/news'),
            path.join(__dirname, '../public/files/projects'),
            path.join(__dirname, '../uploads') // Root uploads if any
        ];

        for (const dir of directoriesToClean) {
            if (fs.existsSync(dir)) {
                console.log(`Cleaning ${dir}...`);
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (file === '.gitignore') continue;
                    const curPath = path.join(dir, file);
                    if (fs.lstatSync(curPath).isDirectory()) {
                        fs.rmSync(curPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(curPath);
                    }
                }
            }
        }
        console.log('All directories cleaned.');

        console.log('Cleanup completed successfully!');
    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        await db.destroy();
    }
}

cleanupData();
