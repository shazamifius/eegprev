const { knex: db } = require('../database');

class Project {
    static async create(projectData) {
        // SQLite returns [id]
        const [id] = await db('projects').insert(projectData);
        return id;
    }

    static async findById(id) {
        return db('projects').where({ id }).first();
    }

    static async findByIdWithAuthor(id) {
        return db('projects')
            .join('users', 'projects.author_id', 'users.id')
            .select('projects.*', 'users.name as author_name')
            .where('projects.id', id)
            .first();
    }

    static async findByAuthor(authorId) {
        return db('projects').where({ author_id: authorId }).orderBy('created_at', 'desc');
    }

    static async findAllWithAuthors({ is_public, limit, offset, search, author_id }) {
        let query = db('projects')
            .join('users', 'projects.author_id', 'users.id')
            .select('projects.*', 'users.name as author_name')
            .orderBy('projects.created_at', 'desc');

        if (typeof is_public !== 'undefined') {
            query = query.where('projects.is_public', is_public ? 1 : 0);
        }
        if (author_id) {
            query = query.where('projects.author_id', author_id);
        }
        if (search) {
            query = query.where('projects.title', 'like', `%${search}%`);
        }

        if (limit) query = query.limit(limit);
        if (offset) query = query.offset(offset);
        return query;
    }

    static async update(id, updates) {
        return db('projects').where({ id }).update(updates);
    }

    static async delete(id) {
        return db('projects').where({ id }).del();
    }

    // Files
    static async addFile(fileData) {
        return db('project_files').insert(fileData);
    }

    static async getFiles(projectId) {
        return db('project_files').where({ project_id: projectId });
    }

    static async getFile(id) {
        return db('project_files').where({ id }).first();
    }

    static async deleteFile(id) {
        return db('project_files').where({ id }).del();
    }

    // Comments
    static async addComment(commentData) {
        return db('project_comments').insert(commentData);
    }

    static async getCommentsWithAuthors(projectId) {
        return db('project_comments')
            .join('users', 'project_comments.user_id', 'users.id')
            .select('project_comments.*', 'users.name as author_name', 'users.avatar as author_avatar')
            .where('project_comments.project_id', projectId)
            .orderBy('project_comments.created_at', 'desc');
    }

    // Upvotes
    static async getUpvote(projectId, userId) {
        return db('project_upvotes').where({ project_id: projectId, user_id: userId }).first();
    }

    static async addUpvote(projectId, userId) {
        // Transaction to ensure count sync?
        return db.transaction(async trx => {
            await trx('project_upvotes').insert({ project_id: projectId, user_id: userId });
            await trx('projects').where({ id: projectId }).increment('upvotes', 1);
        });
    }

    // Badges Check (Architecture specific)
    static async countByAuthor(authorId) {
        const result = await db('projects').where({ author_id: authorId }).count('* as count').first();
        return result.count;
    }

    // Images (if needed separately from files or banner)
    static async setMainImage(projectId, imagePath) {
        await db('project_images').where({ project_id: projectId }).update({ is_main: 0 });
        return db('project_images').where({ project_id: projectId, image_path: imagePath }).update({ is_main: 1 });
    }
}

module.exports = Project;
