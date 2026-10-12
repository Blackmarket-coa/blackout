-- Scheduled-message text is kept only while it is still needed.
--
-- The API holds a scheduled message's text as plaintext from the moment it is
-- scheduled until the bot posts it. Before this change it also kept the text
-- of every delivered, cancelled and permanently failed message forever, with
-- nothing reading it again: the list route returns pending messages only and
-- no client shows past ones. The store now clears `body` and `formatted_body`
-- when a message is delivered, cancelled or finally fails; this clears the rows
-- written before that.
--
-- File-mode snapshots keep old text until the store next rewrites them; memory
-- mode drops everything on restart anyway.
UPDATE scheduled_messages
   SET body = '', formatted_body = NULL
 WHERE status IN ('delivered', 'failed', 'cancelled');
