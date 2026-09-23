function postgresConnectionString() {
  return String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
}

function postgresConfigured() {
  return process.env.DATABASE_PROVIDER === 'postgres' && Boolean(postgresConnectionString());
}

module.exports = { postgresConnectionString, postgresConfigured };
