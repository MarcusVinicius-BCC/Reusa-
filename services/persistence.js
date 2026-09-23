const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { Pool } = require('pg');
const { postgresConfigured, postgresConnectionString } = require('../storage/database-config');

const usePostgres = postgresConfigured();

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_service_processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_service_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  correlation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_service_notifications_user_idx
  ON notification_service_notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_service_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS impact_service_processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS impact_service_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  items INTEGER NOT NULL DEFAULT 0,
  donations INTEGER NOT NULL DEFAULT 0,
  exchanges INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS impact_service_beneficiaries (user_id TEXT PRIMARY KEY);
INSERT INTO impact_service_totals(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

function sqliteRows(db, query, params = []) {
  const result = db.exec(query, params)[0];
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])));
}

function sqliteOne(db, query, params = []) {
  return sqliteRows(db, query, params)[0] || null;
}

class SqliteStore {
  constructor({ file, locateFile }) {
    this.file = file;
    this.locateFile = locateFile;
    this.db = null;
  }

  async open() {
    const directory = path.dirname(this.file);
    fs.mkdirSync(directory, { recursive: true });
    const SQL = await initSqlJs({ locateFile: this.locateFile });
    this.db = fs.existsSync(this.file) ? new SQL.Database(fs.readFileSync(this.file)) : new SQL.Database();
    return this;
  }

  save() {
    const temporaryFile = `${this.file}.tmp`;
    fs.writeFileSync(temporaryFile, Buffer.from(this.db.export()));
    fs.renameSync(temporaryFile, this.file);
  }

  transaction(work) {
    this.db.run('BEGIN');
    try {
      const result = work(this.db);
      this.db.run('COMMIT');
      this.save();
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  close() {
    if (this.db) this.db.close();
  }
}

class NotificationStore {
  constructor(options) {
    this.options = options;
    this.postgres = usePostgres;
    this.store = null;
    this.pool = null;
  }

  async open() {
    if (this.postgres) {
      this.pool = new Pool({ connectionString: postgresConnectionString(), max: Number(process.env.POSTGRES_POOL_SIZE || 10), idleTimeoutMillis: 30_000 });
      await this.pool.query(POSTGRES_SCHEMA);
      const migration = await this.pool.query("INSERT INTO notification_service_migrations(name) VALUES('mark-legacy-notifications-read-v1') ON CONFLICT (name) DO NOTHING RETURNING name");
      if (migration.rowCount) {
        const result = await this.pool.query('UPDATE notification_service_notifications SET read_at=COALESCE(read_at, now()) WHERE read_at IS NULL');
        console.log(`[notifications] marked ${result.rowCount} legacy notifications as read`);
      }
    } else {
      this.store = await new SqliteStore(this.options).open();
      this.store.db.run('CREATE TABLE IF NOT EXISTS processed_events(event_id TEXT PRIMARY KEY,processed_at TEXT NOT NULL)');
      this.store.db.run('CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,link TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,correlation_id TEXT NOT NULL)');
      this.store.db.run('CREATE INDEX IF NOT EXISTS notification_user ON notifications(user_id,created_at DESC)');
      this.store.db.run('CREATE TABLE IF NOT EXISTS notification_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
      const migration = sqliteRows(this.store.db, "INSERT OR IGNORE INTO notification_migrations(name,applied_at) VALUES(?,?) RETURNING name", ['mark-legacy-notifications-read-v1', new Date().toISOString()]);
      if (migration.length) {
        this.store.db.run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE read_at IS NULL', [new Date().toISOString()]);
        console.log('[notifications] marked legacy notifications as read');
      }
      this.store.save();
    }
    return this;
  }

  async processedCount() {
    if (this.postgres) return Number((await this.pool.query('SELECT COUNT(*)::int AS count FROM notification_service_processed_events')).rows[0].count);
    return sqliteOne(this.store.db, 'SELECT COUNT(*) count FROM processed_events').count;
  }

  async notificationsFor(userId) {
    if (this.postgres) {
      const result = await this.pool.query('SELECT id,user_id AS "userId",type,title,text,link,created_at AS "createdAt",read_at AS "readAt" FROM notification_service_notifications WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
      return result.rows;
    }
    return sqliteRows(this.store.db, 'SELECT id,user_id userId,type,title,text,link,created_at createdAt,read_at readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC', [userId]);
  }

  async markRead(userId, notificationId) {
    const timestamp = new Date().toISOString();
    if (this.postgres) {
      await this.pool.query('UPDATE notification_service_notifications SET read_at=$1 WHERE id=$2 AND user_id=$3', [timestamp, notificationId, userId]);
    } else {
      this.store.db.run('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?', [timestamp, notificationId, userId]);
      this.store.save();
    }
  }

  async process(event, notification) {
    if (this.postgres) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query('INSERT INTO notification_service_processed_events(event_id) VALUES($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id', [event.id]);
        if (inserted.rowCount && notification) {
          await client.query('INSERT INTO notification_service_notifications(id,user_id,type,title,text,link,created_at,read_at,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [`notification-${event.id}`, notification.userId, notification.type, notification.title, notification.text, notification.link, event.occurredAt, null, event.correlationId || '']);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return;
    }
    this.store.transaction((db) => {
      const inserted = sqliteRows(db, 'INSERT OR IGNORE INTO processed_events(event_id,processed_at) VALUES(?,?) RETURNING event_id', [event.id, new Date().toISOString()]);
      if (inserted.length && notification) {
        db.run('INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?,?)', [`notification-${event.id}`, notification.userId, notification.type, notification.title, notification.text, notification.link, event.occurredAt, null, event.correlationId || '']);
      }
    });
  }

  async close() {
    if (this.pool) await this.pool.end();
    if (this.store) this.store.close();
  }
}

class ImpactStore {
  constructor(options) {
    this.options = options;
    this.postgres = usePostgres;
    this.store = null;
    this.pool = null;
  }

  async open() {
    if (this.postgres) {
      this.pool = new Pool({ connectionString: postgresConnectionString(), max: Number(process.env.POSTGRES_POOL_SIZE || 10), idleTimeoutMillis: 30_000 });
      await this.pool.query(POSTGRES_SCHEMA);
    } else {
      this.store = await new SqliteStore(this.options).open();
      this.store.db.run('CREATE TABLE IF NOT EXISTS processed_events(event_id TEXT PRIMARY KEY,processed_at TEXT NOT NULL)');
      this.store.db.run('CREATE TABLE IF NOT EXISTS totals(id INTEGER PRIMARY KEY CHECK(id=1),items INTEGER NOT NULL DEFAULT 0,donations INTEGER NOT NULL DEFAULT 0,exchanges INTEGER NOT NULL DEFAULT 0)');
      this.store.db.run('CREATE TABLE IF NOT EXISTS beneficiaries(user_id TEXT PRIMARY KEY)');
      this.store.db.run('INSERT OR IGNORE INTO totals(id) VALUES(1)');
      this.store.save();
    }
    return this;
  }

  async processedCount() {
    if (this.postgres) return Number((await this.pool.query('SELECT COUNT(*)::int AS count FROM impact_service_processed_events')).rows[0].count);
    return sqliteOne(this.store.db, 'SELECT COUNT(*) count FROM processed_events').count;
  }

  async summary() {
    if (this.postgres) {
      const totals = (await this.pool.query('SELECT items AS "itemsReused",donations,exchanges FROM impact_service_totals WHERE id=1')).rows[0];
      const beneficiaries = (await this.pool.query('SELECT COUNT(*)::int AS count FROM impact_service_beneficiaries')).rows[0].count;
      return { ...totals, beneficiaries, consistency: 'eventual' };
    }
    const totals = sqliteOne(this.store.db, 'SELECT items itemsReused,donations,exchanges FROM totals WHERE id=1');
    return { ...totals, beneficiaries: sqliteOne(this.store.db, 'SELECT COUNT(*) count FROM beneficiaries').count, consistency: 'eventual' };
  }

  async process(event) {
    const donations = event.data.outcome === 'Doado' ? 1 : 0;
    const exchanges = event.data.outcome === 'Trocado' ? 1 : 0;
    if (this.postgres) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query('INSERT INTO impact_service_processed_events(event_id) VALUES($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id', [event.id]);
        if (inserted.rowCount) {
          await client.query('UPDATE impact_service_totals SET items=items+1,donations=donations+$1,exchanges=exchanges+$2 WHERE id=1', [donations, exchanges]);
          await client.query('INSERT INTO impact_service_beneficiaries(user_id) VALUES($1) ON CONFLICT (user_id) DO NOTHING', [event.data.interestedId]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return;
    }
    this.store.transaction((db) => {
      const inserted = sqliteRows(db, 'INSERT OR IGNORE INTO processed_events(event_id,processed_at) VALUES(?,?) RETURNING event_id', [event.id, new Date().toISOString()]);
      if (inserted.length) {
        db.run('UPDATE totals SET items=items+1,donations=donations+?,exchanges=exchanges+? WHERE id=1', [donations, exchanges]);
        db.run('INSERT OR IGNORE INTO beneficiaries VALUES(?)', [event.data.interestedId]);
      }
    });
  }

  async close() {
    if (this.pool) await this.pool.end();
    if (this.store) this.store.close();
  }
}

module.exports = { NotificationStore, ImpactStore, usePostgres };
