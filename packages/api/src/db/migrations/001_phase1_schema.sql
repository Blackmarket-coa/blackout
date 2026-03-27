-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  reputation_score INT DEFAULT 0,
  reputation_tier VARCHAR(50),
  pubkey_ed25519 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE communities (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  matrix_room_id VARCHAR(255) UNIQUE,
  description TEXT,
  federation_tier VARCHAR(50),
  is_broadcast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channels (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel_type VARCHAR(50),
  is_private BOOLEAN DEFAULT FALSE,
  matrix_room_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  channel_id UUID REFERENCES channels(id),
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  content_stego_tier INT,
  signature TEXT,
  is_encrypted BOOLEAN DEFAULT FALSE,
  encryption_algorithm VARCHAR(50),
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE votes (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  proposer_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  vote_type VARCHAR(50),
  options JSONB,
  requires_quorum INT DEFAULT 50,
  duration_hours INT DEFAULT 168,
  status VARCHAR(50),
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vote_entries (
  id UUID PRIMARY KEY,
  vote_id UUID REFERENCES votes(id),
  user_id UUID REFERENCES users(id),
  choice VARCHAR(255),
  weight INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vote_id, user_id)
);

CREATE TABLE federation_links (
  id UUID PRIMARY KEY,
  source_community_id UUID REFERENCES communities(id),
  target_community_id UUID REFERENCES communities(id),
  link_type VARCHAR(50),
  matrix_bridge_room_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
