// normalize_phones.js - Migration script to normalize existing phone numbers to E.164 format
import mysql from "mysql2/promise";
import { normalizePhoneMX } from '../functions/db.js';

// Database configuration - you should pass these via environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hotel_db',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: "Z",
};

(async () => {
  console.log('Starting phone normalization migration...');
  console.log('Database:', dbConfig.database);
  console.log('Host:', dbConfig.host);
  console.log('\n⚠️  Make sure you have a backup of your database before proceeding!\n');

  const pool = mysql.createPool(dbConfig);

  try {
    // Get all users with non-null phones
    const [rows] = await pool.query('SELECT id, phone FROM users WHERE phone IS NOT NULL');
    console.log(`Found ${rows.length} users with phone numbers\n`);

    let updates = 0, conflicts = 0, skipped = 0, errors = 0;

    for (const r of rows) {
      try {
        const norm = normalizePhoneMX(r.phone);
        
        if (!norm) {
          console.log(`⚠️  User ${r.id}: Could not normalize phone "${r.phone}"`);
          skipped++;
          continue;
        }
        
        if (norm === r.phone) {
          // Already normalized
          skipped++;
          continue;
        }

        // Check for conflicts (another user already has this normalized phone)
        const [dups] = await pool.query(
          'SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1',
          [norm, r.id]
        );
        
        if (dups.length) {
          console.log(`⚠️  CONFLICT: Users ${r.id} and ${dups[0].id} would have same phone: ${norm}`);
          console.log(`   Original: "${r.phone}" -> "${norm}"`);
          conflicts++;
          continue;
        }

        // Update the phone
        await pool.query('UPDATE users SET phone = ? WHERE id = ?', [norm, r.id]);
        console.log(`✓ User ${r.id}: "${r.phone}" -> "${norm}"`);
        updates++;
      } catch (err) {
        console.error(`✗ Error processing user ${r.id}:`, err.message);
        errors++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Total users: ${rows.length}`);
    console.log(`Updated: ${updates}`);
    console.log(`Skipped (already normalized): ${skipped}`);
    console.log(`Conflicts: ${conflicts}`);
    console.log(`Errors: ${errors}`);

    if (conflicts > 0) {
      console.log('\n⚠️  Warning: Some phone numbers have conflicts.');
      console.log('These users need manual review to determine which record to keep.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }

  process.exit(0);
})();