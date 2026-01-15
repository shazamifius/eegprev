const fs = require('fs');
const path = require('path');
const { knex } = require('../database');

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const PUBLIC_UPLOADS_DIR = path.join(__dirname, '../public/uploads'); // Check if this exists
const PROJECT_UPLOADS_DIR = path.join(__dirname, '../uploads/projects');

async function clearTable(tableName) {
    try {
        await knex(tableName).del();
        console.log(`Cleared table: ${tableName}`);
    } catch (error) {
        // Ignore error if table doesn't exist (e.g. if migrations ran partially)
        console.warn(`Could not clear table ${tableName}: ${error.message}`);
    }
}

async function clearDirectory(directory) {
    if (fs.existsSync(directory)) {
        const files = fs.readdirSync(directory);
        for (const file of files) {
            // Keep .gitignore or other specific system files if needed, but for "virgin" state, usually delete all.
            // We'll skip deleting the directory itself, just content.
            if (file === '.gitignore' && directory === UPLOADS_DIR) continue; // Keep gitignore in root uploads if present

            const fullPath = path.join(directory, file);
            if (fs.lstatSync(fullPath).isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }
        }
        console.log(`Cleared directory: ${directory}`);
    } else {
        console.log(`Directory not found (skipping): ${directory}`);
    }
}

async function resetDatabase() {
    console.log('Starting system reset...');

    // 1. Disable Foreign Keys only for SQLite 
    // Knex doesn't always support this easily across all drivers, but for SQLite:
    await knex.raw('PRAGMA foreign_keys = OFF');

    // 2. Clear Tables (Order strictly shouldn't matter with FK off, but good practice to do children first)
    const tables = [
        'reports',
        'messages',
        'daily_prompts',
        'user_badges',
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
        'users'
        // 'badges' -> INTENTIONALLY SKIPPED (System data)
    ];

    for (const table of tables) {
        await clearTable(table);
    }

    // 3. Re-enable Foreign Keys
    await knex.raw('PRAGMA foreign_keys = ON');

    // 4. Clear Files
    // Based on exploration:
    // uploads/projects might exist
    // public/uploads might exist

    // Clear root uploads folder (careful not to delete the folder itself if app expects it)
    await clearDirectory(UPLOADS_DIR);

    // Also check public/files or public/images if they store user content?
    // Based on ls public: css, files, images, js.
    // public/images usually static assets. public/files might be downloads?
    // Use plan: focus on 'uploads' which I viewed earlier.

    console.log('System reset complete. All user data, projects, and comments have been removed.');
    process.exit(0);
}

resetDatabase().catch(err => {
    console.error('Reset failed:', err);
    process.exit(1);
});
