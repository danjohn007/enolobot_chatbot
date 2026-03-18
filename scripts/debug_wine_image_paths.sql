-- Debug script to check wine image paths in database
-- Usage: Run this in your MySQL console to verify image path configuration

-- Step 1: See all wines with their image_path values
SELECT 
    id,
    name,
    image_path,
    CASE 
        WHEN image_path IS NULL OR image_path = '' THEN 'EMPTY'
        WHEN image_path LIKE '/uploads/%' THEN 'HAS_LEADING_UPLOADS' 
        WHEN image_path LIKE 'public/uploads/%' THEN 'HAS_PUBLIC_UPLOADS'
        WHEN image_path LIKE 'amenities/wines/%' THEN 'CORRECT_FORMAT'
        ELSE 'UNKNOWN_FORMAT'
    END AS path_format,
    price,
    is_active
FROM wines
ORDER BY id;

-- Step 2: Check wines with image_path that might cause issues
SELECT 
    id,
    name,
    image_path,
    CONCAT('http://enolobot.digital/sistema/public/uploads/', 
           REPLACE(REPLACE(image_path, '/uploads/', ''), 'public/', ''),
           '') AS constructed_url
FROM wines
WHERE image_path IS NOT NULL AND image_path != ''
ORDER BY id;

-- Step 3: Show the correct URLs that should be used
-- Expected format examples:
-- - amenities/wines/wine1.png 
-- - amenities/wines/wine2.png
-- Full URL will be: http://enolobot.digital/sistema/public/uploads/amenities/wines/wine1.png

-- Step 4: If you need to UPDATE the paths, use one of these based on your current format:

-- Option A: If image_path has 'uploads/' prefix, remove it
-- UPDATE wines SET image_path = REPLACE(image_path, 'uploads/', '') 
-- WHERE image_path LIKE 'uploads/%';

-- Option B: If image_path has 'public/uploads/' prefix, remove it
-- UPDATE wines SET image_path = REPLACE(image_path, 'public/uploads/', '')
-- WHERE image_path LIKE 'public/uploads/%';

-- Option C: If image_path has '/uploads/' prefix (leading slash), remove it  
-- UPDATE wines SET image_path = REPLACE(image_path, '/uploads/', '')
-- WHERE image_path LIKE '/uploads/%';

-- Option D: If paths are completely wrong, fix them manually
-- UPDATE wines SET image_path = 'amenities/wines/wine2.png' WHERE id = 2;
-- UPDATE wines SET image_path = 'amenities/wines/wine3.png' WHERE id = 3;
