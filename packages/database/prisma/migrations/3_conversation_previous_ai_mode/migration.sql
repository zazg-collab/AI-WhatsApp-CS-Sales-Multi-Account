-- Track the AI mode in effect before an admin takeover so return-to-AI (DR1)
-- can restore it instead of silently escalating a supervised chat to ai_on.
ALTER TABLE conversations ADD COLUMN previous_ai_mode "AiMode";
