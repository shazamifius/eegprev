exports.up = function(knex) {
  return knex.schema.createTable('reports', function(table) {
    table.increments('id').primary();
    table.integer('reporter_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('target_type').notNullable(); // 'user' or 'post'
    table.integer('target_id').notNullable();
    table.text('reason').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('reports');
};
