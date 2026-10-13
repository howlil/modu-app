-- Browser-scoped, opt-in Google Tasks credentials for Modu Daily.
-- No personal task content is stored in D1. Refresh tokens and PKCE verifiers
-- are encrypted by Workers before inserting them.
CREATE TABLE IF NOT EXISTS daily_oauth_sessions (
  owner_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_oauth_flows (
  state_hash TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_oauth_flows_owner ON daily_oauth_flows(owner_hash);
CREATE TABLE IF NOT EXISTS daily_google_tokens (
  owner_hash TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  connected_at INTEGER NOT NULL
);
