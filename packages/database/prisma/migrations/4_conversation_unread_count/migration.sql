-- Track unread inbound messages per conversation for the dashboard badge.
ALTER TABLE conversations ADD COLUMN unread_count INTEGER NOT NULL DEFAULT 0;
