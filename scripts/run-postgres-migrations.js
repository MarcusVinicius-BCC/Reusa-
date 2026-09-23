const fs=require('fs'),path=require('path'); const {Client}=require('pg');
const { postgresConnectionString } = require('../storage/database-config');
async function applyMigrations(db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const file of fs.readdirSync(path.join(__dirname,'..','migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    if ((await db.query('SELECT 1 FROM schema_migrations WHERE version=$1',[file])).rowCount) continue;
    await db.query('BEGIN');
    try {
      await db.query(fs.readFileSync(path.join(__dirname,'..','migrations',file),'utf8'));
      await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);
      await db.query('COMMIT');
      console.log('Applied '+file);
    } catch (e) { await db.query('ROLLBACK'); throw e; }
  }
}
if (require.main === module) {
  const url=postgresConnectionString();
  if (!url) throw new Error('POSTGRES_URL or DATABASE_URL is required');
  (async()=>{const db=new Client({connectionString:url});await db.connect();try{await applyMigrations(db)}finally{await db.end()}})().catch(e=>{console.error(e);process.exit(1)});
}
module.exports = { applyMigrations };
