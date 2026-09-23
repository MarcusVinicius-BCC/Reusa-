/* One-time migration tool. It copies the existing core SQLite database to PostgreSQL. */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { Client } = require('pg');
const { postgresConnectionString } = require('../storage/database-config');
const { applyMigrations } = require('./run-postgres-migrations');

const root = path.join(__dirname, '..');
const sqliteFile = path.join(process.env.DATA_DIR || path.join(root, 'data'), 'reusa.sqlite');
const connectionString = postgresConnectionString();
if (!connectionString) throw new Error('POSTGRES_URL or DATABASE_URL is required');
if (!fs.existsSync(sqliteFile)) throw new Error(`SQLite database not found: ${sqliteFile}`);

function quote(identifier) { return `"${String(identifier).replaceAll('"', '""')}"`; }

async function main() {
  const SQL = await initSqlJs({ locateFile: (file) => path.join(root, 'node_modules', 'sql.js', 'dist', file) });
  const sqlite = new SQL.Database(fs.readFileSync(sqliteFile));
  const rows = sqlite.exec("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")[0]?.values || [];
  const order = ['users', 'posts', 'threads', 'messages', 'collection_points', 'inspiration_products', 'comments', 'post_likes', 'favorites', 'auth_identities', 'post_views', 'negotiations', 'reviews', 'reports', 'blocked_users', 'collection_point_suggestions', 'notifications', 'event_outbox'];
  const tables = rows.sort(([left], [right]) => (order.indexOf(left) < 0 ? 999 : order.indexOf(left)) - (order.indexOf(right) < 0 ? 999 : order.indexOf(right)));
  const pg = new Client({ connectionString });
  await pg.connect();
  try {
    await applyMigrations(pg);
    await pg.query('BEGIN');
    for (const [name] of tables) {
      const result = sqlite.exec(`SELECT * FROM ${quote(name)}`)[0];
      if (!result || !result.values.length) continue;
      const columns = result.columns;
      const statement = `INSERT INTO ${quote(name)} (${columns.map(quote).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) ON CONFLICT DO NOTHING`;
      for (const row of result.values) await pg.query(statement, row);
      console.log(`Migrated ${result.values.length} rows from ${name}`);
    }
    await pg.query('COMMIT');
    console.log('PostgreSQL migration completed successfully.');
  } catch (error) {
    await pg.query('ROLLBACK');
    throw error;
  } finally {
    await pg.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
