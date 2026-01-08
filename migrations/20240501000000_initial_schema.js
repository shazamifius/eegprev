// migrations/20240501000000_initial_schema.js

exports.up = function (knex) {
    return knex.schema
        // Users Table
        .createTableIfNotExists('users', (table) => {
            table.increments('id').primary();
            table.text('name').notNullable();
            table.text('email').notNullable().unique();
            table.text('password').notNullable();
            table.text('classe');
            table.integer('age');
            table.text('birthdate');
            table.text('discord');
            table.text('instagram');
            table.text('snapchat');
            table.text('portfolio');
            table.text('bio');
            table.text('avatar');
            table.boolean('is_admin').defaultTo(0);

            // Coworking fields
            table.boolean('is_coworking').defaultTo(0);
            table.text('coworking_room');
            table.text('coworking_activity');
            table.datetime('coworking_start_time');

            // Theme colors
            table.text('color_bg');
            table.text('color_text');
            table.text('color_primary');
            table.text('color_secondary');
        })

        // Projects Table
        .createTableIfNotExists('projects', (table) => {
            table.increments('id').primary();
            table.text('title').notNullable();
            table.text('description');
            table.text('readme_content');
            table.text('banner_path');
            table.integer('author_id').references('id').inTable('users').onDelete('CASCADE');
            table.text('project_type').notNullable().defaultTo('internal');
            table.text('github_url');
            table.boolean('is_public').defaultTo(0);
            table.boolean('allow_download').defaultTo(1);
            table.datetime('created_at').defaultTo(knex.fn.now());
            table.integer('upvotes').defaultTo(0);

            // Indices
            table.index('author_id');
            table.index('is_public');
            table.index(['is_public', 'created_at']); // Composite index
            table.index(['author_id', 'created_at']); // Composite index
        })

        // Showcase Images Table
        .createTableIfNotExists('showcase_images', (table) => {
            table.increments('id').primary();
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.text('image_path').notNullable();
        })

        // Project Images Table
        .createTableIfNotExists('project_images', (table) => {
            table.increments('id').primary();
            table.integer('project_id').references('id').inTable('projects').onDelete('CASCADE');
            table.text('image_path').notNullable();
            table.boolean('is_main');
        })

        // Project Upvotes Table
        .createTableIfNotExists('project_upvotes', (table) => {
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.integer('project_id').references('id').inTable('projects').onDelete('CASCADE');
            table.primary(['user_id', 'project_id']);
        })

        // Posts Table
        .createTableIfNotExists('posts', (table) => {
            table.increments('id').primary();
            table.text('content').notNullable();
            table.text('media_path');
            table.text('media_type');
            table.text('category');
            table.integer('author_id').references('id').inTable('users').onDelete('CASCADE');
            table.integer('upvotes').defaultTo(0);
            table.datetime('created_at').defaultTo(knex.fn.now());
            table.index('author_id');
        })

        // Post Upvotes Table
        .createTableIfNotExists('post_upvotes', (table) => {
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.integer('post_id').references('id').inTable('posts').onDelete('CASCADE');
            table.primary(['user_id', 'post_id']);
        })

        // News Table
        .createTableIfNotExists('news', (table) => {
            table.increments('id').primary();
            table.text('title').notNullable();
            table.text('content').notNullable();
            table.text('image_path');
            table.text('video_url');
            table.integer('author_id').references('id').inTable('users').onDelete('CASCADE');
            table.datetime('created_at').defaultTo(knex.fn.now());
        })

        // Help Requests Table
        .createTableIfNotExists('help_requests', (table) => {
            table.increments('id').primary();
            table.text('title').notNullable();
            table.text('description').notNullable();
            table.text('category').notNullable();
            table.text('status').defaultTo('ouverte');
            table.integer('author_id').references('id').inTable('users').onDelete('CASCADE');
            table.datetime('created_at').defaultTo(knex.fn.now());
            table.boolean('is_anonymous').defaultTo(0);
            table.text('request_type').defaultTo('help');
            table.text('tags');
        })

        // Help Request Comments Table
        .createTableIfNotExists('help_request_comments', (table) => {
            table.increments('id').primary();
            table.text('content').notNullable();
            table.text('image_path');
            table.integer('author_id').references('id').inTable('users').onDelete('CASCADE');
            table.integer('request_id').references('id').inTable('help_requests').onDelete('CASCADE');
            table.datetime('created_at').defaultTo(knex.fn.now());
        })

        // Post Comments Table
        .createTableIfNotExists('post_comments', (table) => {
            table.increments('id').primary();
            table.integer('post_id').references('id').inTable('posts').onDelete('CASCADE');
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.text('comment').notNullable();
            table.datetime('created_at').defaultTo(knex.fn.now());
        })

        // Project Collaborators Table
        .createTableIfNotExists('project_collaborators', (table) => {
            table.integer('project_id').references('id').inTable('projects').onDelete('CASCADE');
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.primary(['project_id', 'user_id']);
        })

        // Project Comments Table
        .createTableIfNotExists('project_comments', (table) => {
            table.increments('id').primary();
            table.integer('project_id').references('id').inTable('projects').onDelete('CASCADE');
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.text('comment').notNullable();
            table.datetime('created_at').defaultTo(knex.fn.now());
            table.index('project_id');
        })

        // Project Files Table
        .createTableIfNotExists('project_files', (table) => {
            table.increments('id').primary();
            table.integer('project_id').references('id').inTable('projects').onDelete('CASCADE');
            table.text('file_name').notNullable();
            table.text('file_path').notNullable();
            table.index('project_id');
        })

        // Badges Table
        .createTableIfNotExists('badges', (table) => {
            table.increments('id').primary();
            table.text('name').notNullable();
            table.text('description');
            table.text('icon');
            table.text('criteria_type');
            table.integer('criteria_value');
        })

        // User Badges Table
        .createTableIfNotExists('user_badges', (table) => {
            table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
            table.integer('badge_id').references('id').inTable('badges').onDelete('CASCADE');
            table.datetime('awarded_at').defaultTo(knex.fn.now());
            table.primary(['user_id', 'badge_id']);
            table.index('user_id');
        })

        // Daily Prompts Table
        .createTableIfNotExists('daily_prompts', (table) => {
            table.increments('id').primary();
            table.text('content').notNullable();
            table.date('active_date').defaultTo(knex.raw('CURRENT_DATE')); // sqlite specific or knex generic? knex.fn.now() is datetime. knex.raw for date is safe for sqlite.
            table.datetime('created_at').defaultTo(knex.fn.now());
        })

        // Seed default Badges
        .then(async () => {
            // We only insert if empty logic is tricky in migration without raw check, 
            // but since this is creation, we assume it's fresh or we can use onConflictIgnore if needed.
            // But for initial migration up, we just insert.
            // Actually, better to separate seeds, but to match legacy logic 1:1 we can do it here or leave for a seed file.
            // Creating a seed file is cleaner. I will skip seeding here.
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('daily_prompts')
        .dropTableIfExists('user_badges')
        .dropTableIfExists('badges')
        .dropTableIfExists('project_files')
        .dropTableIfExists('project_comments')
        .dropTableIfExists('project_collaborators')
        .dropTableIfExists('post_comments')
        .dropTableIfExists('help_request_comments')
        .dropTableIfExists('help_requests')
        .dropTableIfExists('news')
        .dropTableIfExists('post_upvotes')
        .dropTableIfExists('posts')
        .dropTableIfExists('project_upvotes')
        .dropTableIfExists('project_images')
        .dropTableIfExists('showcase_images')
        .dropTableIfExists('projects')
        .dropTableIfExists('users');
};
