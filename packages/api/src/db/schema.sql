CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  reputation_score INT DEFAULT 0,
  reputation_tier VARCHAR(50),
  pubkey_ed25519 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  matrix_room_id VARCHAR(255) UNIQUE,
  description TEXT,
  federation_tier VARCHAR(50),
  is_broadcast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel_type VARCHAR(50),
  is_private BOOLEAN DEFAULT FALSE,
  matrix_room_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
