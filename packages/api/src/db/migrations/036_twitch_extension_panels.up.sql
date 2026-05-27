-- Twitch-extension-compat registry.
--
-- A creator registers panel extensions once; they surface on all of the
-- creator's streams via the stream response `extensions[]` and render in the
-- livestream viewer's sandboxed panel stack (see the client ExtensionFrame).
-- `bundle_url` is the extension JS the client sandbox fetches (https only,
-- enforced at the API); `capabilities` are the granted `twitch.ext.*` scopes.

CREATE TABLE twitch_extension_panels (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  bundle_url TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_twitch_extension_panels_creator
  ON twitch_extension_panels (creator_id);
CREATE INDEX idx_twitch_extension_panels_active
  ON twitch_extension_panels (creator_id, is_active) WHERE is_active = TRUE;
