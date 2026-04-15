-- Run this to add the missing columns to the phases table
-- and update the seed data with isDefault/isFinal flags.

USE qtask_db;

-- Add isDefault and isFinal to phases if they don't exist yet
ALTER TABLE phases
  ADD COLUMN IF NOT EXISTS isDefault TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isFinal   TINYINT(1) NOT NULL DEFAULT 0;

-- Update seed phases with sensible defaults
-- "Backlog (Requirements)" is the default landing column for new tasks
-- "Completed" is the final column that triggers the Done modal
UPDATE phases SET isDefault = 1, isFinal = 0 WHERE label = 'Backlog (Requirements)';
UPDATE phases SET isDefault = 0, isFinal = 1 WHERE label = 'Completed';
UPDATE phases SET isDefault = 0, isFinal = 0 WHERE label NOT IN ('Backlog (Requirements)', 'Completed');
