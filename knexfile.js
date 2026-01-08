// knexfile.js
module.exports = {
    development: {
        client: 'sqlite3',
        connection: {
            filename: './database.db'
        },
        useNullAsDefault: true,
        migrations: {
            directory: './migrations'
        },
        seeds: {
            directory: './seeds'
        }
    },
    test: {
        client: 'sqlite3',
        connection: {
            filename: ':memory:'
        },
        useNullAsDefault: true,
        migrations: {
            directory: './migrations'
        }
    },
    production: {
        client: 'sqlite3',
        connection: {
            filename: './database.db'
        },
        useNullAsDefault: true,
        migrations: {
            directory: './migrations'
        }
    }
};
