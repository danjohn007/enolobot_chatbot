-- Cleanup script for malformed room_reservations
-- This script removes incomplete/draft reservations that were created before the fix
-- 
-- IMPORTANT: Make a backup before running this script!
-- Run this query first to review what will be deleted:

SELECT 
    id, 
    room_id, 
    guest_id,
    check_in, 
    check_out, 
    total_price, 
    status, 
    created_at
FROM room_reservations
WHERE (
    -- Missing or invalid check-in date
    check_in IS NULL 
    OR check_in = '0000-00-00'
    OR check_in = ''
    -- Missing or invalid check-out date
    OR check_out IS NULL 
    OR check_out = '0000-00-00'
    OR check_out = ''
    -- Missing or zero total price (excluding intentional free rooms)
    OR (total_price IS NULL OR total_price = 0)
)
AND (
    -- Only delete if status is NULL or not in confirmed/cancelled states
    status IS NULL 
    OR status NOT IN ('confirmed', 'cancelled')
)
ORDER BY id DESC
LIMIT 200;

-- If the above query looks correct, uncomment and run this DELETE statement:
/*
DELETE FROM room_reservations
WHERE (
    check_in IS NULL 
    OR check_in = '0000-00-00'
    OR check_in = ''
    OR check_out IS NULL 
    OR check_out = '0000-00-00'
    OR check_out = ''
    OR (total_price IS NULL OR total_price = 0)
)
AND (
    status IS NULL 
    OR status NOT IN ('confirmed', 'cancelled')
);
*/

-- Optional: Clean up any remaining draft status reservations
-- (These should not exist after the fix, but this will clean up any stragglers)
/*
DELETE FROM room_reservations
WHERE status = 'draft'
  AND updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
*/

-- After cleanup, you may want to add constraints to prevent future issues:
-- (Uncomment if your MySQL version supports CHECK constraints)
/*
ALTER TABLE room_reservations
  ADD CONSTRAINT chk_check_in_valid CHECK (check_in IS NOT NULL AND check_in != '0000-00-00'),
  ADD CONSTRAINT chk_check_out_valid CHECK (check_out IS NOT NULL AND check_out != '0000-00-00'),
  ADD CONSTRAINT chk_dates_order CHECK (check_in < check_out);
*/