const { knex: db } = require('../database');

class User {
    static async findByEmail(email) {
        return db('users').where({ email }).first();
    }

    static async findById(id) {
        return db('users').where({ id }).first();
    }

    static async create(userData) {
        // returning('id') works on Postgres but sqlite3 returns [id] or we use .then logic.
        // Knex .insert() returns an array of ids for single insert in sqlite too.
        const [id] = await db('users').insert(userData);
        return id;
    }

    static async update(id, updates) {
        return db('users').where({ id }).update(updates);
    }

    // Specific helper for coworking logic used in logout
    static async setCoworkingStatus(id, isCoworking) {
        return db('users').where({ id }).update({ is_coworking: isCoworking ? 1 : 0 });
    }

    static async listClasses() {
        // Equivalent to SELECT DISTINCT classe FROM users WHERE classe IS NOT NULL AND classe != '' ORDER BY classe ASC
        return db('users')
            .distinct('classe')
            .whereNotNull('classe')
            .whereNot('classe', '')
            .orderBy('classe', 'asc');
    }

    static async search({ name, classe }) {
        let query = db('users');

        if (name) {
            query = query.where('name', 'like', `%${name}%`);
        }

        if (classe) {
            query = query.where({ classe });
        }

        // Exclude admins or keep them? Original often kept them but maybe filtered implicitly?
        // Let's assume we want all users matching criteria.

        return query;
    }
}

module.exports = User;
