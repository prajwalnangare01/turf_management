// Automated Database Backup Utility for TurfFlow
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../src/data/supabaseClient.js';
import { store } from '../src/data/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '../../backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFile = path.join(backupDir, `turfflow-backup-${timestamp}.json`);
  console.log(`📦 Starting automated TurfFlow backup to: ${backupFile}...`);

  const supabase = getSupabase();
  const backupData = {
    timestamp: new Date().toISOString(),
    source: supabase ? 'supabase-postgresql' : 'in-memory-store',
    tables: {}
  };

  const tableNames = [
    'venues',
    'sports',
    'courts',
    'court_sports',
    'pricing_rules',
    'customers',
    'admin_users',
    'bookings',
    'payments',
    'cancellation_policies',
    'coupons'
  ];

  if (supabase) {
    for (const table of tableNames) {
      try {
        const { data, error } = await supabase.from(table).select('*');
        if (!error && Array.isArray(data)) {
          backupData.tables[table] = data;
          console.log(`  ✅ Backed up table '${table}' (${data.length} records)`);
        } else {
          console.warn(`  ⚠️ Could not backup table '${table}':`, error?.message);
        }
      } catch (err) {
        console.warn(`  ⚠️ Failed fetching '${table}':`, err.message);
      }
    }
  } else {
    backupData.tables = {
      venue: store.getVenue(),
      sports: store.getSports(),
      courts: store.getCourts(),
      customers: store.getCustomers(),
      admin_users: store.getAdminUsers(),
      bookings: store.getBookings(),
      payments: store.getPayments()
    };
    console.log('  ✅ Backed up in-memory dataset');
  }

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`🎉 Backup completed successfully! Saved ${backupFile} (${(fs.statSync(backupFile).size / 1024).toFixed(1)} KB)`);
}

runBackup().catch(err => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
