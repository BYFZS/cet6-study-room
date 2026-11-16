CREATE TABLE sync_rooms (
  id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  sealed TEXT NOT NULL,
  updated INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX sync_rooms_updated ON sync_rooms(updated);
--> statement-breakpoint
CREATE TABLE sync_pairs (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES sync_rooms(id) ON DELETE CASCADE,
  sealed TEXT NOT NULL,
  expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX sync_pairs_expiry ON sync_pairs(expires);
