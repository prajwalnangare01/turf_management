// Supabase Schema Migration & Seeder Script
// Executes schema.sql, enforces unique active booking partial index,
// activates Supabase Realtime publication on bookings, and seeds data.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import dotenv from 'dotenv';
import { 
  DEFAULT_VENUE, 
  DEFAULT_SPORTS, 
  DEFAULT_COURTS, 
  DEFAULT_CANCELLATION_POLICIES, 
  DEFAULT_CUSTOMERS, 
  DEFAULT_BOOKINGS 
} from '../src/data/store.js';

dotenv.config();
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_FILE = path.resolve(__dirname, '../../../turf_management-main/schema.sql');

export async function runSupabaseMigration() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.log('ℹ️  No DATABASE_URL or SUPABASE_DB_URL found in environment.');
    console.log('   Skipping remote Supabase migration. The system will operate in high-performance in-memory mode.');
    return { success: false, reason: 'NO_DATABASE_URL' };
  }

  console.log('🔌 Connecting to Supabase PostgreSQL database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL successfully!');

    // 1. Read and execute schema.sql
    console.log(`📄 Reading schema from: ${SCHEMA_FILE}`);
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

    console.log('⚡ Executing DDL Schema migrations...');
    await client.query(schemaSql);
    console.log('✅ Tables & constraints verified!');

    // 2. Verify / Enforce Layer-2 Concurrency Unique Partial Index
    console.log('🔒 Verifying Layer-2 Concurrency Partial Unique Index...');
    const createIndexSql = `
      CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking 
      ON bookings (court_id, booking_date, start_time) 
      WHERE status IN ('pending_payment', 'confirmed');
    `;
    await client.query(createIndexSql);
    console.log('✅ Index `unique_active_booking` is ACTIVE and protecting against double-bookings!');

    // 3. Enable Supabase Realtime publication on bookings and payments
    console.log('📡 Enabling Supabase Realtime publication on `bookings` and `payments`...');
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'payments'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE payments;
          END IF;
        END $$;
      `);
      console.log('✅ Supabase Realtime publication configured for instant WebSocket broadcasting!');
    } catch (pubErr) {
      console.warn('⚠️ Realtime publication configuration note:', pubErr.message);
    }

    // 4. Seed Data if empty
    console.log('🌱 Checking seed data...');
    const venueCheck = await client.query('SELECT count(*) FROM venues');
    if (parseInt(venueCheck.rows[0].count, 10) === 0) {
      console.log('Inserting default Venue record...');
      await client.query(
        `INSERT INTO venues (id, name, address, timezone, gst_number, contact_phone, is_active, min_notice_minutes, max_advance_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          DEFAULT_VENUE.id,
          DEFAULT_VENUE.name,
          DEFAULT_VENUE.address,
          DEFAULT_VENUE.timezone,
          DEFAULT_VENUE.gst_number,
          DEFAULT_VENUE.contact_phone,
          DEFAULT_VENUE.is_active,
          DEFAULT_VENUE.min_notice_minutes,
          DEFAULT_VENUE.max_advance_days
        ]
      );

      console.log('Inserting Sports...');
      for (const sp of DEFAULT_SPORTS) {
        await client.query(
          `INSERT INTO sports (id, name, icon) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
          [sp.id, sp.name, sp.icon]
        );
      }

      console.log('Inserting Courts...');
      for (const c of DEFAULT_COURTS) {
        await client.query(
          `INSERT INTO courts (id, venue_id, name, slot_duration_minutes, opening_time, closing_time, buffer_minutes, status, base_price_per_hour)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
          [
            c.id,
            c.venue_id,
            c.name,
            c.slot_duration_minutes,
            c.opening_time,
            c.closing_time,
            c.buffer_minutes,
            c.status,
            c.base_price_per_hour
          ]
        );

        for (const spId of c.sport_ids) {
          await client.query(
            `INSERT INTO court_sports (court_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [c.id, spId]
          );
        }
      }

      console.log('Inserting Default Customers...');
      for (const cust of DEFAULT_CUSTOMERS) {
        await client.query(
          `INSERT INTO customers (id, name, phone, email, total_bookings, total_spent, no_show_count, is_blacklisted)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (phone) DO NOTHING`,
          [
            cust.id,
            cust.name,
            cust.phone,
            cust.email,
            cust.total_bookings,
            cust.total_spent,
            cust.no_show_count,
            cust.is_blacklisted
          ]
        );
      }

      console.log('✅ Seed data inserted successfully!');
    } else {
      console.log('✅ Venue data already seeded in Supabase.');
    }

    // 5. Query and output stats
    const stats = await client.query(`
      SELECT 
        (SELECT count(*) FROM venues) as venues,
        (SELECT count(*) FROM sports) as sports,
        (SELECT count(*) FROM courts) as courts,
        (SELECT count(*) FROM customers) as customers,
        (SELECT count(*) FROM bookings) as bookings
    `);
    console.log('\n📊 Database Status Overview:', stats.rows[0]);

    await client.end();
    return { success: true, stats: stats.rows[0] };
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    try { await client.end(); } catch (e) {}
    return { success: false, error: err.message };
  }
}

// Run directly if invoked from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSupabaseMigration().then(res => {
    if (!res.success && res.reason !== 'NO_DATABASE_URL') {
      process.exit(1);
    }
  });
}
