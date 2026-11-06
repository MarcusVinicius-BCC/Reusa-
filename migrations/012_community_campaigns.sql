CREATE TABLE IF NOT EXISTS campaigns (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT NOT NULL, beneficiary TEXT NOT NULL,
 material TEXT NOT NULL, target INTEGER NOT NULL CHECK(target > 0),
 city TEXT NOT NULL, logistics TEXT NOT NULL, deadline TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_contributions (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK(quantity > 0),
 note TEXT NOT NULL DEFAULT '', reply TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pledged' CHECK(status IN ('pledged','received','cancelled')),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_contributions_campaign ON campaign_contributions(campaign_id);
CREATE INDEX IF NOT EXISTS campaigns_created ON campaigns(created_at);
