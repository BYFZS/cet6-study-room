CREATE TABLE sync_accounts (
  id TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  room_id TEXT NOT NULL UNIQUE REFERENCES sync_rooms(id),
  sealed TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE sync_account_attempts (
  account_id TEXT PRIMARY KEY REFERENCES sync_accounts(id) ON DELETE CASCADE,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
