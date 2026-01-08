exports.up = function (knex) {
    return knex.schema.createTable('messages', function (table) {
        table.increments('id').primary();
        table.text('content').notNullable();
        table.integer('author_id').notNullable();
        table.string('author_name').notNullable();
        table.string('author_avatar').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('messages');
};
