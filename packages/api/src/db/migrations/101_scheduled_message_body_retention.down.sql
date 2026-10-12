-- Intentionally a no-op. The up migration erased message text that no longer
-- served any purpose; it cannot be restored, and rolling back must not pretend
-- otherwise. The schema is unchanged, so there is nothing else to undo.
SELECT 1;
