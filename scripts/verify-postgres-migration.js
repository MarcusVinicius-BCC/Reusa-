const { Client } = require('pg');
const { postgresConnectionString } = require('../storage/database-config');

const connectionString = postgresConnectionString();
if (!connectionString) throw new Error('POSTGRES_URL or DATABASE_URL is required');

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    const required = ['users', 'posts', 'threads', 'messages', 'collection_points', 'inspiration_products', 'comments', 'post_likes', 'favorites', 'auth_identities', 'post_views', 'negotiations', 'reviews', 'reports', 'blocked_users', 'collection_point_suggestions', 'notifications', 'event_outbox'];
    const missing = required.filter((name) => !tables.rows.some((row) => row.tablename === name));
    if (missing.length) throw new Error(`Missing required tables: ${missing.join(', ')}`);
    const constraints = await client.query("SELECT conname FROM pg_constraint WHERE contype = 'p'");
    if (!constraints.rows.length) throw new Error('No primary-key constraints found; migration is incomplete');
    const counts = await Promise.all(['users', 'posts', 'negotiations', 'event_outbox'].map(async (table) => ({ table, count: Number((await client.query(`SELECT COUNT(*) AS count FROM "${table}"`)).rows[0].count) })));
    console.table(counts);
    console.log('PostgreSQL schema and imported core records verified.');
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
