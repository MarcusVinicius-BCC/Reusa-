const { Pool } = require('pg');
const { postgresConnectionString, postgresConfigured } = require('./database-config');

/**
 * Asynchronous PostgreSQL boundary for the core. Business routes must use this
 * repository rather than importing `pg` directly, so the SQLite-to-Postgres
 * transition stays contained and testable.
 */
class PostgresRepository {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString, max: Number(process.env.POSTGRES_POOL_SIZE || 10), idleTimeoutMillis: 30_000 });
  }

  async query(text, params = []) {
    return this.pool.query(text, params);
  }

  async one(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  async many(text, params = []) {
    return (await this.query(text, params)).rows;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async health() {
    await this.query('SELECT 1');
    return true;
  }

  users() { return new (require('./postgres-domains').UserRepository)(this); }
  posts() { return new (require('./postgres-domains').PostRepository)(this); }

  async close() {
    await this.pool.end();
  }
}

function postgresEnabled() {
  return postgresConfigured();
}

module.exports = { PostgresRepository, postgresEnabled, postgresConnectionString };
