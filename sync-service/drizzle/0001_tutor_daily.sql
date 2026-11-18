CREATE TABLE tutor_daily (
  day TEXT NOT NULL,
  room_id TEXT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests > 0),
  PRIMARY KEY (day, room_id)
);
