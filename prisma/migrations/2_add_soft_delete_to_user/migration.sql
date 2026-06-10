-- AddColumn deleted_at to users table for soft-delete support
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- Create index for efficient soft-delete filtering (finding active users)
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
